import { createRng, pick } from "./rng.js";
import { DEMO_GUILD_NAMES, DEMO_CHANNEL_NAMES, DEMO_SERVER_BADGES as DEMO_BADGES } from "./demoNames.js";

function pad(n) {
  return String(n).padStart(2, "0");
}

function fmtDuration(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad(h)}h ${pad(m)}m`;
}

export function generateFakeServerAnalytics(seed) {
  const rng = typeof seed === "function" ? seed : createRng(seed ?? Date.now());

  const lvl = 1 + Math.floor(rng() * 60);
  const xpNeed = 800 + lvl * 40;
  const xpNow = Math.floor(rng() * xpNeed);
  const xp = lvl * 900 + xpNow;

  const bank = Math.floor(rng() * 40000);
  const hand = Math.floor(rng() * 8000);

  return {
    name: pick(rng, DEMO_GUILD_NAMES),
    icon: `https://api.dicebear.com/9.x/shapes/svg?seed=${Math.floor(rng() * 1e9)}`,
    badges: rng() > 0.5 ? [pick(rng, DEMO_BADGES)] : [],
    messages: Math.floor(rng() * 400000),
    voice_time: fmtDuration(Math.floor(rng() * 90000)),
    activity_seconds: fmtDuration(Math.floor(rng() * 40000)),
    total_balance: bank + hand,
    bank_balance: bank,
    balance: hand,
    members: 20 + Math.floor(rng() * 4000),
    xp_now: xpNow,
    xp_need: xpNeed,
    xp,
    lvl,
  };
}

function fakeChannels() {
  const message_channels = {};
  DEMO_CHANNEL_NAMES.forEach((name, i) => { message_channels[`demo-ch-${i}`] = { name }; });
  return { message_channels, voice_channels: { "demo-vc-0": { name: "General Voice" } } };
}

export function generateFakeServerConfig(seed) {
  const rng = typeof seed === "function" ? seed : createRng(seed ?? Date.now());
  const channels = fakeChannels();

  const config = {
    mod_log_channel: "demo-ch-2",
    moderation: rng() > 0.4,
    moderation_type: rng() > 0.5 ? "ai" : "normal",
    rules: "Be respectful. No spam. Keep it civil.",
    aibot: rng() > 0.5,
    ai_message_delete: rng() > 0.6,
    ai_message_ttl: 10,
    ai_long_message_ttl: 30,
    word_channel: "demo-ch-0",
    words: JSON.stringify(["forbidden", "spamword"]),
    filter: "normal",
    number_channel: "demo-ch-0",
    news: true,
    news_channel: "demo-ch-1",
    important: true,
    important_channel: "demo-ch-1",
    critical: true,
    critical_channel: "demo-ch-2",
    ttl_channel: JSON.stringify({ "demo-ch-0": "1d" }),
    save_messages: true,
    save_voice: true,
    save_activity: rng() > 0.3,
  };

  return { config, channels };
}