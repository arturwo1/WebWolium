import { grantConsent, denyConsent } from '@/lib/consent/google.js';
import { createWebRequestService } from "@/services/index.js";
import { $, $$, hud, lsJSONGet, lsJSONSet, getLang, setLang, onLangChange, getSupportedLangs, getLanguageNativeName, warmLanguageNativeNames, initCollapsible, t } from "@/lib/index.js";

const lang = $("[data-lang-select]");
const variation = $("[data-variation-select]");
const cookieConsent = $("#cookie-consent");

const SECTION_ORDER = ["overview", "messages", "voice", "activity", "diagnostics", "visibility"];

const SECTION_LABELS = {
  "overview": "privacy.section_overview",
  "messages": "privacy.section_messages",
  "voice": "privacy.section_voice",
  "activity": "privacy.section_activity",
  "diagnostics": "privacy.section_diagnostics",
  "visibility": "privacy.section_visibility",
};

const FLAG_DEPENDENCIES = {
  "save_message_data": "save_messages",
  "save_activity_data": "save_activity",
  "save_activity_profile": "save_activity",
};

const SECTION_FLAGS = {
  "messages": ["save_messages", "save_message_data"],
  "voice": ["save_voice"],
  "activity": ["save_activity", "save_activity_data", "save_activity_profile"],
  "diagnostics": ["track_activity"],
  "visibility": ["publicity"],
};

const FLAG_TEXTS = {
  "save_messages": "privacy.flag_save_messages",
  "save_message_data": "privacy.flag_save_message_data",
  "save_voice": "privacy.flag_save_voice",
  "save_activity": "privacy.flag_save_activity",
  "save_activity_data": "privacy.flag_save_activity_data",
  "save_activity_profile": "privacy.flag_save_activity_profile",
  "track_activity": "privacy.flag_track_activity",
  "publicity": "privacy.flag_publicity",
};

const PRESETS = {
  "private": {
    "save_messages": false,
    "save_message_data": false,
    "save_voice": false,
    "save_activity": false,
    "save_activity_data": false,
    "save_activity_profile": false,
    "track_activity": false,
    "publicity": false,
  },
  "balanced": {
    "save_messages": true,
    "save_message_data": false,
    "save_voice": true,
    "save_activity": true,
    "save_activity_data": false,
    "save_activity_profile": false,
    "track_activity": true,
    "publicity": false,
  },
  "analytics": {
    "save_messages": true,
    "save_message_data": true,
    "save_voice": true,
    "save_activity": true,
    "save_activity_data": true,
    "save_activity_profile": true,
    "track_activity": true,
    "publicity": true,
  },
};

function languageLabel(code) {
  return getLanguageNativeName(code);
}

async function syncLangSelect() {
  const uiLang = getLang();
  const supported = new Set(getSupportedLangs());

  for (const opt of [...lang.options]) {
    if (!supported.has(opt.value)) opt.remove();
  }

  await warmLanguageNativeNames();
  lang.value = uiLang;

  for (const opt of lang.options) {
    opt.textContent = languageLabel(opt.value);
  }
}

function getVariation() {
  return localStorage.getItem("variation") || "normal";
}

function setVariation(variation) {
  localStorage.setItem("variation", variation);
}

function syncVariationSelect() {
  variation.value = getVariation();
}

export async function initSettingsPage(sb) {
  const wr = createWebRequestService(sb, {
    defaultCacheTtlMs: 30_000,
    defaultCooldownMs: 1_500,
    defaultTimeoutMs: 15_000
  });

  const { data: sessionData } = await sb.auth.getSession();
  const CACHE_KEY = `wolium:last_privacy_settings`;
  const CACHE_TTL_MS = 5 * 60 * 1000;

  let currentPrivacy = {};

  await syncLangSelect();
  onLangChange(() => syncLangSelect());

  lang.addEventListener("change", async () => {
    await setLang(lang.value);
    await syncLangSelect();
  });

  syncVariationSelect();
  variation.addEventListener("change", () => {
    setVariation(variation.value);
    hud.success(t("settings.variation_saved"));
  });

  cookieConsent.checked = localStorage.getItem("cookie-consent") === "granted";
  cookieConsent.onchange = () => {
    localStorage.setItem("cookie-consent", cookieConsent.checked ? "granted" : "denied");
    cookieConsent.checked ? grantConsent() : denyConsent();
  };

  const privacySections = $("#privacySections");
  const sectionTemplate = $("#privacySectionTemplate");
  const flagTemplate = $("#privacyFlagTemplate");

  function buildPrivacyDOM() {
    privacySections.innerHTML = "";

    for (const sectionKey of SECTION_ORDER) {
      if (sectionKey === "overview") continue;

      const flags = SECTION_FLAGS[sectionKey];
      if (!flags || !flags.length) continue;

      const sectionEl = sectionTemplate.content.cloneNode(true);
      const section = sectionEl.querySelector(".privacy-section");
      section.dataset.sectionKey = sectionKey;
      const title = sectionEl.querySelector(".privacy-section__title");
      title.setAttribute("data-i18n", SECTION_LABELS[sectionKey]);
      title.textContent = t(SECTION_LABELS[sectionKey]);

      const flagsContainer = sectionEl.querySelector(".privacy-flags");

      for (const flagKey of flags) {
        const flagEl = flagTemplate.content.cloneNode(true);
        const input = flagEl.querySelector(".privacy-flag__input");
        const label = flagEl.querySelector(".privacy-flag__label");

        input.dataset.flag = flagKey;
        label.setAttribute("data-i18n", FLAG_TEXTS[flagKey]);
        label.textContent = t(FLAG_TEXTS[flagKey]);

        input.addEventListener("change", async () => {
          currentPrivacy[flagKey] = input.checked;
          syncUIWithState();
          await savePrivacyState(currentPrivacy);
        });

        flagsContainer.appendChild(flagEl);
      }

      privacySections.appendChild(sectionEl);
      $("#privacySettings").classList.remove("loading");
    }

    initCollapsible(privacySections, ["messages", "voice", "activity", "diagnostics", "visibility"]);
  }

  function syncUIWithState() {
    for (const [dependent, parent] of Object.entries(FLAG_DEPENDENCIES)) {
      if (currentPrivacy[parent] === false) {
        currentPrivacy[dependent] = false;
      }
    }

    const allInputs = privacySections.querySelectorAll('.privacy-flag__input');
    allInputs.forEach(input => {
      const flagKey = input.dataset.flag;
      input.checked = currentPrivacy[flagKey] === true;

      const parentFlag = Object.keys(FLAG_DEPENDENCIES).find(key => key === flagKey)
        ? FLAG_DEPENDENCIES[flagKey]
        : null;

      if (parentFlag) {
        input.disabled = currentPrivacy[parentFlag] === false;
      }
    });

    lsJSONSet(CACHE_KEY, { t: Date.now(), res: currentPrivacy });
  }

  async function loadPrivacySettings() {
    const now = Date.now();
    const saved = lsJSONGet(CACHE_KEY, null);

    if (saved?.res && (now - saved.t < CACHE_TTL_MS)) {
      currentPrivacy = saved.res;
      syncUIWithState();
      return;
    }

    try {
      const res = await wr.queue("user_privacy", {}, {
        cacheTtlMs: 60_000,
        cooldownMs: 2_000,
        timeoutMs: 4_000
      });

      if (res && !res.error) {
        currentPrivacy = res;
        syncUIWithState();
      } else {
        throw new Error(res?.error || "Unknown load error");
      }
    } catch (e) {
      console.warn("[settings] privacy load failed, using cache fallback:", e);
      if (saved?.res) {
        currentPrivacy = saved.res;
        syncUIWithState();
      }
      hud.error(t("settings.privacy_load_error"));
    }
  }

  async function savePrivacyState(payload) {
    const backupState = { ...currentPrivacy };

    try {
      const res = await wr.queue("set_privacy", payload, {
        cacheTtlMs: 0,
        cooldownMs: 500,
        timeoutMs: 5_000
      });

      if (!res?.error) {
        if (Object.keys(res).length > 0) currentPrivacy = res;
        syncUIWithState();
        hud.success(t("settings.privacy_saved"));
      } else {
        throw new Error(res.error);
      }
    } catch (e) {
      currentPrivacy = backupState;
      syncUIWithState();
      hud.error(t("settings.privacy_save_error"), e);
    }
  }

  async function applyPreset(preset) {
    const flags = PRESETS[preset];
    if (!flags) return;

    currentPrivacy = { ...currentPrivacy, ...flags };
    syncUIWithState();

    try {
      const res = await wr.queue("set_privacy", flags, {
        cacheTtlMs: 0,
        cooldownMs: 500,
        timeoutMs: 5_000
      });

      if (!res?.error) {
        if (Object.keys(res).length > 0) currentPrivacy = res;
        syncUIWithState();
        hud.success(t("settings.preset_applied"));
      } else {
        throw new Error(res.error);
      }
    } catch (e) {
      hud.error(t("settings.preset_error"));
      const saved = lsJSONGet(CACHE_KEY, null);
      if (saved?.res) {
        currentPrivacy = saved.res;
        syncUIWithState();
      }
    }
  }

  $$(".btn-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      const preset = btn.dataset.preset;
      applyPreset(preset);
    });
  });

  const btnDeleteMessages = $("#btnDeleteMessages");
  const btnDeleteVoice = $("#btnDeleteVoice");
  const btnDeleteActivities = $("#btnDeleteActivities");
  const btnDeleteEconomy = $("#btnDeleteEconomy");
  const btnDeleteAnalytics = $("#btnDeleteAnalytics");
  const btnDeleteAllData = $("#btnDeleteAllData");

  async function confirmDelete(action, title) {
    const confirmed = window.confirm(`${t(title)}\n\n${t("settings.delete_confirm")}`);
    if (!confirmed) return false;

    try {
      const res = await wr.queue("delete_user_data", { action }, {
        cacheTtlMs: 0,
        cooldownMs: 500,
        timeoutMs: 15_000
      });

      if (res?.error || !res) {
        console.warn(`[settings] delete ${action} failed:`, res?.error);
        hud.error(t("settings.delete_error"), res?.error);
        return false;
      } else {
        hud.success(t("settings.delete_success", { action: t(title).toLowerCase() }));
      }
      return true;
    } catch (e) {
      console.warn(`[settings] delete ${action} failed:`, e);
      hud.error(t("settings.delete_error"));
      return false;
    }
  }

  btnDeleteMessages?.addEventListener("click", () => confirmDelete("messages", "settings.delete_messages"));
  btnDeleteVoice?.addEventListener("click", () => confirmDelete("voice", "settings.delete_voice"));
  btnDeleteActivities?.addEventListener("click", () => confirmDelete("activities", "settings.delete_activities"));
  btnDeleteEconomy?.addEventListener("click", () => confirmDelete("economy", "settings.delete_economy"));
  btnDeleteAnalytics?.addEventListener("click", () => confirmDelete("analytics", "settings.delete_analytics"));

  btnDeleteAllData?.addEventListener("click", async () => {
    const confirmed = window.confirm(
      `${t("settings.delete_all_data")}\n\n${t("settings.delete_all_data_confirm")}\n\n${t("settings.delete_permanent")}`
    );
    if (!confirmed) return;

    const input = window.prompt(t("settings.delete_all_data_double_confirm"));
    if (input?.trim().toUpperCase() !== "DELETE") return;

    try {
      const res = await wr.queue("delete_all_user_data", {}, {
        cacheTtlMs: 0, cooldownMs: 500, timeoutMs: 15_000
      });

      if (res?.error || !res) {
        hud.error(t("settings.delete_error"), res?.error);
      } else {
        hud.success(t("settings.all_data_deleted"));
      }

      setTimeout(() => { window.location.href = "/"; }, 2000);
    } catch (e) {
      hud.error(t("settings.delete_error"));
    }
  });

  buildPrivacyDOM();
  await loadPrivacySettings();
}