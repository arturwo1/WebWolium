import { createRng, pick } from "./rng.js";
import { SECTION_FLAGS, FLAG_TEXTS } from "@/lib/settings/accountSettingsForm.js";

const DEMO_LANGS = ["en", "ru", "es", "ua"];

export function generateFakeAccountSettingsState(seed) {
  const rng = typeof seed === "function" ? seed : createRng(seed ?? Date.now());

  const state = {};
  for (const flags of Object.values(SECTION_FLAGS)) {
    for (const flagKey of flags) {
      state[flagKey] = rng() > 0.45;
    }
  }
  return state;
}

export function buildAccountSettingsDemoViewModel(state, extras = {}) {
  const sections = {};
  for (const [sectionKey, flags] of Object.entries(SECTION_FLAGS)) {
    if (!flags.length) continue;
    sections[sectionKey] = flags.map((key) => ({
      key,
      labelKey: FLAG_TEXTS[key],
      value: state[key] === true,
    }));
  }

  return {
    sections,
    lang: extras.lang ?? "en",
    cookieConsent: extras.cookieConsent ?? true,
  };
}

export function generateFakeAccountSettingsExtras(seed) {
  const rng = typeof seed === "function" ? seed : createRng(seed ?? Date.now());
  return {
    lang: pick(rng, DEMO_LANGS),
    cookieConsent: rng() > 0.3,
  };
}