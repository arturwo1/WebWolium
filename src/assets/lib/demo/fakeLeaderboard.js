import { createRng, pick } from "./rng.js";
import { DEMO_USER_NAMES as DEMO_NAMES, DEMO_GUILD_NAMES } from "./demoNames.js";

function generateEntryPool(rng, isServerScope, count) {
  const names = isServerScope ? DEMO_GUILD_NAMES : DEMO_NAMES;
  const pool = [];

  for (let i = 0; i < count; i++) {
    const rawValue = Math.floor(rng() * 900000) + 100;
    pool.push(
      isServerScope
        ? { guild_name: names[i % names.length], icon: null, value: rawValue }
        : { display_name: names[i % names.length], avatar: null, user_id: `demo-${i}`, value: rawValue }
    );
  }

  return pool.sort((a, b) => b.value - a.value).map((entry, i) => ({ ...entry, rank: i + 1 }));
}

export function generateFakeLeaderboardEntries(seed, { scope = "world" } = {}) {
  const rng = typeof seed === "function" ? seed : createRng(seed ?? Date.now());
  const isServerScope = scope === "top_servers";

  const entries = generateEntryPool(rng, isServerScope, 10);
  const totalValue = entries.reduce((sum, e) => sum + e.value, 0);

  return {
    entries,
    total_users: isServerScope ? 40 + Math.floor(rng() * 200) : 400 + Math.floor(rng() * 5000),
    total_value: totalValue,
  };
}