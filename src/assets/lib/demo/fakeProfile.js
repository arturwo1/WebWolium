import { createRng, pick } from "./rng.js";
import { detectDemoDeviceKey } from "./rng.js";
import { DEMO_USER_NAMES as DEMO_NAMES, DEMO_STATUSES, DEMO_USER_BADGES as DEMO_BADGES } from "./demoNames.js";

function pad(n) {
  return String(n).padStart(2, "0");
}

function fmtDuration(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad(h)}h ${pad(m)}m`;
}

export { createRng, detectDemoDeviceKey };

export function generateFakeProfileData(seed, deviceKey) {
  const rng = typeof seed === "function" ? seed : createRng(seed ?? Date.now());
  const device = deviceKey ?? detectDemoDeviceKey();

  const lvl = 1 + Math.floor(rng() * 40);
  const xpNeed = 400 + lvl * 25;
  const xpNow = Math.floor(rng() * xpNeed);
  const xp = lvl * 500 + xpNow;

  const bank = Math.floor(rng() * 5000);
  const hand = Math.floor(rng() * 1500);

  const status = pick(rng, DEMO_STATUSES);

  const clientStatus = { desktop: "offline", mobile: "offline", web: "offline" };
  clientStatus[device] = status;

  return {
    user_name: pick(rng, DEMO_NAMES),
    display_name: pick(rng, DEMO_NAMES),
    user_avatar: `https://api.dicebear.com/9.x/identicon/svg?seed=${Math.floor(rng() * 1e9)}`,
    status,
    client_status: clientStatus,
    badges: rng() > 0.5 ? [pick(rng, DEMO_BADGES)] : [],
    messages: Math.floor(rng() * 20000),
    voice_time: fmtDuration(Math.floor(rng() * 6000)),
    activity_seconds: fmtDuration(Math.floor(rng() * 3000)),
    total_balance: bank + hand,
    bank_balance: bank,
    balance: hand,
    user_commands: Math.floor(rng() * 400),
    xp_now: xpNow,
    xp_need: xpNeed,
    xp,
    lvl,
  };
}