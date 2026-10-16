export const BUNKER_TABS = ["story", "players", "replay", "info"];

export const TRAIT_FIELDS = [
  { category: "profession", field: "profession_keys" },
  { category: "gender", field: "gender_key" },
  { category: "age", field: "age" },
  { category: "health", field: "health_condition_keys" },
  { category: "hobby", field: "hobby_keys" },
  { category: "phobia", field: "phobia_keys" },
  { category: "skill", field: "skill_keys" },
  { category: "baggage", field: "baggage_keys" }
];

const SETTINGS_ORDER = [
  "max_players",
  "bunker_capacity",
  "extra_traits_count",
  "game_duration",
  "trait_selection_duration",
  "discussion_duration",
  "voting_duration",
  "round_pause_duration",
  "anonymity",
  "catastrophe_mode",
  "ai_story"
];

const MESSAGE_PHASES = ["initial_discussion", "reveal", "discussion", "voting", "pause"];
const MESSAGE_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) - ([\s\S]*)$/;
const REVEAL_RE = /^([a-z_]+):(\d+)$/;
const DISCORD_ID_RE = /^\d{15,25}$/;

export function humanizeSlug(slug) {
  const text = String(slug ?? "").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export function discordIdOf(user) {
  const meta = user?.user_metadata ?? {};
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  const fromIdentity = identities.find((item) => item?.provider === "discord")?.id;
  const raw = meta.provider_id ?? meta.sub ?? fromIdentity ?? null;
  return raw != null && DISCORD_ID_RE.test(String(raw)) ? String(raw) : null;
}

export function parseReveal(value) {
  const match = REVEAL_RE.exec(String(value ?? ""));
  return match ? { category: match[1], index: Number(match[2]) } : null;
}

export function traitValues(card, spec) {
  if (!card || !spec) return [];
  const raw = card[spec.field];
  if (Array.isArray(raw)) return raw.filter((key) => key != null && key !== "").map((key) => ({ key: String(key) }));
  if (raw == null || raw === "") return [];
  if (spec.field === "age") return [{ value: String(raw) }];
  return [{ key: String(raw) }];
}

export function sortedRounds(payload) {
  return Object.entries(payload?.rounds ?? {})
    .map(([number, data]) => ({ number: Number(number), data: data ?? {} }))
    .filter((round) => Number.isFinite(round.number))
    .sort((a, b) => a.number - b.number);
}

export function playerName(payload, id) {
  const name = payload?.players?.[id]?.name;
  return typeof name === "string" && name.trim() ? name : null;
}

export function buildPlayers(payload) {
  const players = payload?.players ?? {};
  const finalists = new Set((payload?.finalists ?? payload?.ai?.finalists ?? []).map(String));
  const revealed = new Map();
  const eliminated = new Map();

  for (const round of sortedRounds(payload)) {
    const reveals = round.data?.phases?.reveal?.reveals ?? {};
    for (const [playerId, spec] of Object.entries(reveals)) {
      const parsed = parseReveal(spec);
      if (!parsed) continue;
      if (!revealed.has(playerId)) revealed.set(playerId, new Map());
      revealed.get(playerId).set(`${parsed.category}:${parsed.index}`, round.number);
    }

    const out = round.data?.phases?.voting?.eliminated;
    if (out != null && !eliminated.has(String(out))) eliminated.set(String(out), round.number);
  }

  const list = Object.entries(players).map(([id, player], order) => {
    const traits = TRAIT_FIELDS.map((spec) => ({
      category: spec.category,
      items: traitValues(player?.card, spec).map((item, index) => ({
        ...item,
        round: revealed.get(id)?.get(`${spec.category}:${index}`) ?? null
      }))
    })).filter((trait) => trait.items.length);

    let status = { kind: "unknown", round: null };
    if (finalists.has(id)) status = { kind: "finalist", round: null };
    else if (eliminated.has(id)) status = { kind: "eliminated", round: eliminated.get(id) };

    return {
      id,
      name: typeof player?.name === "string" && player.name.trim() ? player.name : id,
      bot: Boolean(player?.bot),
      status,
      traits,
      order
    };
  });

  const rank = (player) => {
    if (player.status.kind === "finalist") return [0, 0];
    if (player.status.kind === "eliminated") return [1, player.status.round];
    return [2, 0];
  };

  return list.sort((a, b) => {
    const [ra, sa] = rank(a);
    const [rb, sb] = rank(b);
    return ra - rb || sa - sb || a.order - b.order;
  });
}

export function parseMessage(item, phase, index) {
  if (!item || typeof item !== "object") return null;
  const user = Object.keys(item)[0];
  const raw = user != null ? item[user] : null;
  if (typeof raw !== "string") return null;

  const match = MESSAGE_RE.exec(raw);
  const body = (match ? match[7] : raw).replace(/\n{3,}/g, "\n\n").trim();
  if (!body) return null;

  const at = match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])) / 1000 : null;
  return { phase, user: String(user), at, text: body, index };
}

export function normalizeMessages(phaseData, phase) {
  const list = Array.isArray(phaseData?.messages) ? phaseData.messages : [];
  return list.map((item, index) => parseMessage(item, phase, index)).filter(Boolean);
}

export function buildRounds(payload) {
  const players = payload?.players ?? {};

  return sortedRounds(payload).map(({ number, data }) => {
    const reveals = Object.entries(data?.phases?.reveal?.reveals ?? {}).map(([playerId, spec]) => {
      const parsed = parseReveal(spec);
      const field = parsed ? TRAIT_FIELDS.find((item) => item.category === parsed.category) : null;
      const item = parsed && field ? traitValues(players[playerId]?.card, field)[parsed.index] ?? null : null;
      return { playerId, category: parsed?.category ?? null, item };
    });

    const votes = Object.entries(data?.phases?.voting?.votes ?? {}).map(([from, to]) => ({ from, to: String(to) }));

    const counts = new Map();
    for (const vote of votes) counts.set(vote.to, (counts.get(vote.to) ?? 0) + 1);
    const tally = [...counts.entries()]
      .map(([target, count]) => ({ target, count }))
      .sort((a, b) => b.count - a.count || String(a.target).localeCompare(String(b.target)));

    const out = data?.phases?.voting?.eliminated;
    const tied = Array.isArray(data?.phases?.voting?.tied) ? data.phases.voting.tied.map(String) : [];
    const messages = MESSAGE_PHASES.flatMap((phase) => normalizeMessages(data?.phases?.[phase], phase));

    return {
      number,
      startedAt: data?.started_at ?? null,
      messages,
      tied,
      reveals,
      votes,
      tally,
      eliminated: out != null ? String(out) : null
    };
  });
}

export function settingsOf(payload) {
  const settings = payload?.settings ?? {};
  const known = SETTINGS_ORDER.filter((key) => key in settings);
  const rest = Object.keys(settings).filter((key) => !SETTINGS_ORDER.includes(key)).sort();
  return [...known, ...rest].map((key) => ({ key, value: settings[key] }));
}

export function gameSummary(game) {
  const payload = game?.payload ?? null;
  const players = Object.keys(payload?.players ?? {});
  const title = payload?.ai?.title;

  return {
    id: game?.id ?? "",
    title: typeof title === "string" && title.trim() ? title.trim() : null,
    won: Boolean(game?.won),
    playersCount: players.length || null,
    roundsCount: Object.keys(payload?.rounds ?? {}).length || null,
    difficulty: payload?.difficulty ?? null,
    catastrophe: payload?.catastrophe?.slug ?? null,
    years: payload?.catastrophe?.years ?? null
  };
}
