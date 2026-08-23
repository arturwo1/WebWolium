import { generateFakeAccountSettingsState, generateFakeAccountSettingsExtras, buildAccountSettingsDemoViewModel } from "@/lib/demo/fakeAccountSettings.js";
import { createRng } from "@/lib/demo/rng.js";

export default function () {
  const rng = createRng(Date.now());
  const state = generateFakeAccountSettingsState(rng);
  const extras = generateFakeAccountSettingsExtras(rng);
  return buildAccountSettingsDemoViewModel(state, extras);
}