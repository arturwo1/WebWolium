import { parseLocalInput, toLocalDatetimeValue } from "@/lib/format/datetime.js";

const PRESETS = new Set(["7d", "30d", "90d"]);

const SELECT_FIELDS = [
  ["guild", "chartGuildId"],
  ["channel", "chartChannelId"],
  ["role", "chartRoleId"],
  ["status", "chartActivityStatus"]
];

const TEXT_FIELDS = [
  ["context", "chartContext"],
  ["command", "chartCommandName"],
  ["activity", "chartActivityName"],
  ["track", "chartActivityTrack"],
  ["album", "chartActivityAlbum"],
  ["artist", "chartActivityArtist"]
];

const NUMBER_FIELDS = [
  ["vmin", "chartVoiceMinDuration"],
  ["vmax", "chartVoiceMaxDuration"],
  ["amin", "chartActivityMinDuration"],
  ["amax", "chartActivityMaxDuration"]
];

const RENDERED_SELECT_IDS = ["chartGuildId", "chartChannelId", "chartRoleId"];

const OPTION_FIELDS = [
  ["average", "chartOptionsAverage"],
  ["compare", "chartOptionsCompare"],
  ["delta", "chartOptionsDelta"]
];

export const CHART_PARAM_KEYS = [
  "preset",
  "from",
  "to",
  "jump",
  "options",
  ...SELECT_FIELDS.map(([key]) => key),
  ...TEXT_FIELDS.map(([key]) => key),
  ...NUMBER_FIELDS.map(([key]) => key)
];

function hasOption(el, value) {
  return Array.from(el.options).some((option) => option.value === value && !option.disabled);
}

export function snapshotChartSelects(root) {
  const out = {};
  for (const id of RENDERED_SELECT_IDS) {
    const el = root.querySelector("#" + id);
    if (el && el.value) out[id] = el.value;
  }
  return out;
}

export function restoreChartSelects(root, snapshot) {
  for (const id of RENDERED_SELECT_IDS) {
    const value = snapshot[id];
    const el = root.querySelector("#" + id);
    if (value && el && hasOption(el, value)) el.value = value;
  }
}

export function readChartParams(search) {
  const out = {};
  for (const key of CHART_PARAM_KEYS) {
    const value = search.get(key);
    if (value !== null && value !== "") out[key] = value;
  }
  return out;
}

export function collectChartParams(root) {
  const get = (id) => root.querySelector("#" + id);
  const out = {};

  const preset = get("chartPreset")?.value;
  if (preset && preset !== "30d") out.preset = preset;

  if (preset === "custom") {
    const from = parseLocalInput(get("chartFrom")?.value);
    const to = parseLocalInput(get("chartTo")?.value);
    if (from !== null && to !== null) {
      out.from = String(Math.floor(from / 1000));
      out.to = String(Math.floor(to / 1000));
    }
  }

  for (const [key, id] of [...SELECT_FIELDS, ...TEXT_FIELDS, ...NUMBER_FIELDS]) {
    const el = get(id);
    if (!el || el.hidden || el.disabled) continue;
    const value = String(el.value ?? "").trim();
    if (value) out[key] = value;
  }

  const jumpBox = get("chartJumpBox");
  if (get("chartJump")?.checked && jumpBox && !jumpBox.hidden) out.jump = "1";

  const options = OPTION_FIELDS.filter(([, id]) => get(id)?.checked).map(([name]) => name);
  if (options.length) out.options = options.join(",");

  return out;
}

export function applyChartParams(root, params, { onGuild = null, notify = false } = {}) {
  const get = (id) => root.querySelector("#" + id);
  const preset = get("chartPreset");
  const from = get("chartFrom");
  const to = get("chartTo");

  const fromSec = Number(params.from);
  const toSec = Number(params.to);
  const hasRange = Number.isFinite(fromSec) && Number.isFinite(toSec) && fromSec > 0 && toSec > fromSec;

  if (hasRange && preset && from && to) {
    from.value = toLocalDatetimeValue(fromSec * 1000);
    to.value = toLocalDatetimeValue(toSec * 1000);
    preset.value = "custom";
  } else if (preset) {
    preset.value = PRESETS.has(params.preset) ? params.preset : "30d";
  }

  const setSelect = (id, value) => {
    const el = get(id);
    if (!el) return;
    const wanted = value ?? "";
    if (hasOption(el, wanted)) el.value = wanted;
  };

  setSelect("chartGuildId", params.guild);
  onGuild?.(get("chartGuildId")?.value ?? "");
  setSelect("chartChannelId", params.channel);
  setSelect("chartRoleId", params.role);
  setSelect("chartActivityStatus", params.status);

  for (const [key, id] of TEXT_FIELDS) {
    const el = get(id);
    if (el) el.value = String(params[key] ?? "").slice(0, 120);
  }

  for (const [key, id] of NUMBER_FIELDS) {
    const el = get(id);
    if (el) el.value = /^\d{1,9}$/.test(params[key] ?? "") ? params[key] : "";
  }

  const jump = get("chartJump");
  if (jump) jump.checked = params.jump === "1";

  const wantedOptions = new Set(String(params.options ?? "").split(","));
  const optionEls = [];
  for (const [name, id] of OPTION_FIELDS) {
    const el = get(id);
    if (!el) continue;
    el.checked = wantedOptions.has(name);
    optionEls.push(el);
  }

  if (!notify) return;

  for (const el of optionEls) el.dispatchEvent(new Event("change", { bubbles: true }));
  (hasRange ? from : preset)?.dispatchEvent(new Event("change", { bubbles: true }));
}
