export const SECTION_ORDER = ["overview", "messages", "voice", "activity", "diagnostics", "visibility"];

export const SECTION_LABELS = {
  overview: "privacy.section_overview",
  messages: "privacy.section_messages",
  voice: "privacy.section_voice",
  activity: "privacy.section_activity",
  diagnostics: "privacy.section_diagnostics",
  visibility: "privacy.section_visibility",
};

export const SECTION_FLAGS = {
  messages: ["save_message_data"],
  voice: [],
  activity: ["save_activity_data", "save_activity_profile"],
  diagnostics: ["track_activity"],
  visibility: ["publicity"],
};

export const FLAG_TEXTS = {
  save_message_data: "privacy.flag_save_message_data",
  save_activity_data: "privacy.flag_save_activity_data",
  save_activity_profile: "privacy.flag_save_activity_profile",
  track_activity: "privacy.flag_track_activity",
  publicity: "privacy.flag_publicity",
};

export const PRESETS = {
  private: {
    save_message_data: false,
    save_activity_data: false,
    save_activity_profile: false,
    track_activity: false,
    publicity: false,
  },
  balanced: {
    save_message_data: false,
    save_activity_data: false,
    save_activity_profile: false,
    track_activity: true,
    publicity: false,
  },
  analytics: {
    save_message_data: true,
    save_activity_data: true,
    save_activity_profile: true,
    track_activity: true,
    publicity: true,
  },
};

export function buildAccountSettingsForm(containerEl, currentState, translate, onFlagChange) {
  if (!containerEl) return;
  containerEl.innerHTML = "";

  for (const sectionKey of SECTION_ORDER) {
    if (sectionKey === "overview") continue;

    const flags = SECTION_FLAGS[sectionKey];
    if (!flags || !flags.length) continue;

    const section = document.createElement("div");
    section.className = "privacy-section";
    section.dataset.sectionKey = sectionKey;

    const title = document.createElement("h3");
    title.className = "privacy-section__title";
    title.textContent = translate(SECTION_LABELS[sectionKey]);
    section.appendChild(title);

    const flagsContainer = document.createElement("div");
    flagsContainer.className = "privacy-flags";

    for (const flagKey of flags) {
      const label = document.createElement("label");
      label.className = "privacy-flag";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "privacy-flag__input";
      input.dataset.flag = flagKey;
      input.checked = currentState[flagKey] === true;

      const span = document.createElement("span");
      span.className = "privacy-flag__label";
      span.textContent = translate(FLAG_TEXTS[flagKey]);

      input.addEventListener("change", () => {
        onFlagChange(flagKey, input.checked);
      });

      label.append(input, span);
      flagsContainer.appendChild(label);
    }

    section.appendChild(flagsContainer);
    containerEl.appendChild(section);
  }
}

export function syncAccountSettingsInputs(containerEl, currentState) {
  containerEl.querySelectorAll(".privacy-flag__input").forEach((input) => {
    input.checked = currentState[input.dataset.flag] === true;
  });
}

export function applyAccountSettingsPreset(preset, currentState) {
  const flags = PRESETS[preset];
  if (!flags) return currentState;
  return { ...currentState, ...flags };
}