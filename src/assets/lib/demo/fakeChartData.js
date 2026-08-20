import { createRng, pick } from "./rng.js";
import { DEMO_GUILD_NAMES, DEMO_CHANNEL_NAMES, DEMO_MESSAGES, DEMO_ACTIVITIES, DEMO_STATUSES } from "./demoNames.js";

export const BASE_DAYS = 416;
const DAY_MS = 864e5;

function pickWeightedHour(rng) {
  const r = rng();
  if (r < 0.55) return 18 + Math.floor(rng() * 6);
  if (r < 0.9) return 8 + Math.floor(rng() * 10);
  return Math.floor(rng() * 24);
}

function dayStart(now, dayIndex) {
  return now - (BASE_DAYS - dayIndex) * DAY_MS;
}

function generateMessageEvents(rng, now) {
  const events = [];
  let day = 0;

  while (day < BASE_DAYS) {
    if (rng() < 0.18) {
      day += 1 + Math.floor(rng() * 3);
      continue;
    }

    const burstCount = 1 + Math.floor(rng() * 3);
    for (let b = 0; b < burstCount; b++) {
      const hour = pickWeightedHour(rng);
      let t = dayStart(now, day) + hour * 3_600_000 + rng() * 3_600_000;
      const burstSize = 3 + Math.floor(rng() * 80);

      for (let m = 0; m < burstSize; m++) {
        if (t >= now) break;
        events.push(t);
        t += (5 + rng() * 180) * 1000;
      }
    }

    day += 1;
  }

  return events.sort((a, b) => a - b);
}

function generateSessions(rng, now, { chance = 0.55, minMinutes = 10, maxHours = 6 }) {
  const sessions = [];

  for (let day = 0; day < BASE_DAYS; day++) {
    if (rng() > chance) continue;

    const hour = pickWeightedHour(rng);
    const start = dayStart(now, day) + hour * 3_600_000 + rng() * 3_600_000;
    const durationMin = minMinutes + rng() * (maxHours * 60 - minMinutes);
    const end = Math.min(now, start + durationMin * 60_000);

    if (end > start) sessions.push({ start, end, activity: pick(rng, DEMO_ACTIVITIES), status: pick(rng, DEMO_STATUSES) });
  }

  return sessions.sort((a, b) => a.start - b.start);
}

function generateMembersSeries(rng, now) {
  const timeline = [];
  let members = 180 + Math.floor(rng() * 60);
  const stepMs = 3 * 3_600_000;

  for (let ts = now - BASE_DAYS * DAY_MS; ts <= now; ts += stepMs) {
    if (rng() < 0.01) members += Math.round((rng() - 0.3) * 40);
    if (rng() >= 0.4) members += Math.round((rng() - 0.42) * 3);
    members = Math.max(10, members);
    timeline.push({ ts, members });
  }

  return timeline;
}

function sumEventsInRange(events, from, to) {
  let lo = 0, hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid] < from) lo = mid + 1; else hi = mid;
  }
  const inRange = [];
  for (let i = lo; i < events.length && events[i] < to; i++) inRange.push(events[i]);
  return inRange;
}

function overlapSeconds(session, from, to) {
  const s = Math.max(session.start, from);
  const e = Math.min(session.end, to);
  return Math.max(0, (e - s) / 1000);
}

function aggregateMessagesBucket(kind, bStart, bEnd, events, rng, guildName) {
  const inBucket = sumEventsInRange(events, bStart, bEnd);
  if (!inBucket.length) return null;

  const lastTs = inBucket[inBucket.length - 1];

  return {
    ts: bStart,
    y: inBucket.length,
    bucket_start: bStart,
    bucket_end: bEnd,
    sample_content: pick(rng, DEMO_MESSAGES),
    sample_url: null,
    meta: { guild_name: guildName, channel_name: pick(rng, DEMO_CHANNEL_NAMES), created_at: lastTs },
  };
}

function aggregateVoiceBucket(bStart, bEnd, sessions, guildName) {
  const seconds = sessions.reduce((sum, s) => sum + overlapSeconds(s, bStart, bEnd), 0);
  if (seconds <= 0) return null;

  return {
    ts: bStart,
    y: Math.round(seconds),
    bucket_start: bStart,
    bucket_end: bEnd,
    meta: { guild_name: guildName, channel_name: pick.length ? undefined : undefined },
  };
}

function aggregateUserActivityBucket(bStart, bEnd, sessions) {
  const overlapping = sessions.filter((s) => overlapSeconds(s, bStart, bEnd) > 0);
  if (!overlapping.length) return null;

  const seconds = overlapping.reduce((sum, s) => sum + overlapSeconds(s, bStart, bEnd), 0);
  const rep = overlapping[overlapping.length - 1];

  return {
    ts: bStart,
    y: Math.round(seconds),
    bucket_start: bStart,
    bucket_end: bEnd,
    count: overlapping.length,
    meta: {
      status: rep.status,
      activity_def: { payload: { name: rep.activity.name, activity_type: rep.activity.type, source_kind: rep.activity.spotify ? 1 : 0 } },
      presence_snapshot: { payload: { status: rep.status, nickname: "Demo User", username: "demouser", avatar_url: null } },
      started_at: rep.start,
      ended_at: rep.end,
    },
  };
}

function aggregateGuildActivityBucket(bStart, bEnd, sessions) {
  const overlapping = sessions.filter((s) => overlapSeconds(s, bStart, bEnd) > 0);
  if (!overlapping.length) return null;

  const seconds = overlapping.reduce((sum, s) => sum + overlapSeconds(s, bStart, bEnd), 0);
  const rep = overlapping[overlapping.length - 1];

  return {
    ts: bStart,
    y: Math.round(seconds),
    bucket_start: bStart,
    bucket_end: bEnd,
    count: overlapping.length,
    meta: { activity_name: rep.activity.name, activity_icon: null },
  };
}

function aggregateMembersBucket(bStart, bEnd, timeline, guildName, carryRef) {
  let last = null;
  for (const p of timeline) {
    if (p.ts > bEnd) break;
    if (p.ts >= bStart) last = p;
  }
  if (!last && timeline.length) {
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].ts <= bStart) { last = timeline[i]; break; }
    }
  }

  const value = last ? last.members : carryRef.value;
  carryRef.value = value;

  return { ts: bStart, y: value, bucket_start: bStart, bucket_end: bEnd, meta: { guild_name: guildName } };
}

function bucketize(kind, from, to, bucketMs, limit, ctx) {
  const bucketCount = Math.max(1, Math.min(limit, Math.ceil((to - from) / bucketMs)));
  const rows = [];
  const carryRef = { value: null };

  for (let i = 0; i < bucketCount; i++) {
    const bStart = from + i * bucketMs;
    const bEnd = bStart + bucketMs;
    let row = null;

    if (kind.includes("messages")) row = aggregateMessagesBucket(kind, bStart, bEnd, ctx.events, ctx.rng, ctx.guildName);
    else if (kind.includes("voice")) row = aggregateVoiceBucket(bStart, bEnd, ctx.sessions, ctx.guildName);
    else if (kind === "user_activities_series") row = aggregateUserActivityBucket(bStart, bEnd, ctx.sessions);
    else if (kind === "guild_activities_series") row = aggregateGuildActivityBucket(bStart, bEnd, ctx.sessions);
    else if (kind.includes("members")) row = aggregateMembersBucket(bStart, bEnd, ctx.timeline, ctx.guildName, carryRef);

    if (row) rows.push(row);
  }

  return rows;
}

export function createFakeChartQueue(seed) {
  const rng = typeof seed === "function" ? seed : createRng(seed ?? Date.now());
  const now = Date.now();
  const guildName = pick(rng, DEMO_GUILD_NAMES);

  const cache = new Map();

  function getCtx(kind) {
    if (cache.has(kind)) return cache.get(kind);

    let ctx;
    if (kind.includes("messages")) ctx = { rng, guildName, events: generateMessageEvents(rng, now) };
    else if (kind.includes("voice")) ctx = { guildName, sessions: generateSessions(rng, now, { chance: 0.5, minMinutes: 10, maxHours: 6 }) };
    else if (kind.includes("activities")) ctx = { sessions: generateSessions(rng, now, { chance: 0.45, minMinutes: 10, maxHours: 5 }) };
    else if (kind.includes("members")) ctx = { guildName, timeline: generateMembersSeries(rng, now) };
    else ctx = {};

    cache.set(kind, ctx);
    return ctx;
  }

  return async function fakeQueueRequest(kind, payload) {
    const ctx = getCtx(kind);
    const from = Number(payload.from);
    const to = Number(payload.to);
    const bucketMs = Number(payload.bucket_ms) || 1_800_000;
    const limit = Number(payload.limit) || 300;

    return bucketize(kind, from, to, bucketMs, limit, ctx);
  };
}