import { between } from "./rng.js";
import { settingsRegistry } from "@/lib/server/settings/registry/index.js";

const SETTING_STEPS = {
  max_players: 1,
  bunker_capacity: 1,
  extra_traits_count: 1,
  game_duration: 60,
  trait_selection_duration: 5,
  discussion_duration: 5,
  voting_duration: 5,
  round_pause_duration: 5
};

const BUNKER_FIELDS = settingsRegistry.find((category) => category.id === "bunker").groups.flatMap((group) => group.fields);

const SETTING_LIMITS = Object.fromEntries(Object.entries(SETTING_STEPS).map(([key, step]) => {
  const field = BUNKER_FIELDS.find((item) => item.key === key);
  return [key, [field.min, field.max, step]];
}));

export function buildLimitedSettings(rng) {
  const settings = {};

  for (const [key, [min, max, step]] of Object.entries(SETTING_LIMITS)) {
    settings[key] = min + step * Math.floor(rng() * ((max - min) / step + 1));
  }

  const [capacityMin, capacityMax] = SETTING_LIMITS.bunker_capacity;
  settings.bunker_capacity = between(rng, capacityMin, Math.min(capacityMax, settings.max_players - 2));

  return settings;
}
