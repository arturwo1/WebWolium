import { grantConsent, denyConsent } from '@/lib/consent/google.js';
import { createWebRequestService } from "@/services/index.js";
import { $, $$, hud, lsJSONGet, lsJSONSet, getLang, setLang, onLangChange, getSupportedLangs, getLanguageNativeName, warmLanguageNativeNames, initCollapsible, t } from "@/lib/index.js";
import { buildAccountSettingsForm, syncAccountSettingsInputs, applyAccountSettingsPreset } from "@/lib/settings/accountSettingsForm.js";

const lang = $("[data-lang-select]");
const variation = $("[data-variation-select]");
const cookieConsent = $("#cookie-consent");

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

  await sb.auth.getSession();
  const CACHE_KEY = `wolium:last_privacy_settings`;
  const CACHE_TTL_MS = 5 * 60 * 1000;

  let currentAccountSettings = {};

  await syncLangSelect();
  onLangChange(() => {
    syncLangSelect();
    buildAccountSettingsDOM();
    syncAccountSettingsInputs(accountSettingsSections, currentAccountSettings);
  });

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

  const accountSettingsSections = $("#privacySections");

  function buildAccountSettingsDOM() {
    buildAccountSettingsForm(accountSettingsSections, currentAccountSettings, t, async (flagKey, checked) => {
      currentAccountSettings[flagKey] = checked;
      syncUIWithState();
      await saveAccountSettingsState(currentAccountSettings);
    });

    $("#privacySettings").classList.remove("loading");
    initCollapsible(accountSettingsSections, ["messages", "voice", "activity", "diagnostics", "visibility"]);
  }

  function syncUIWithState() {
    syncAccountSettingsInputs(accountSettingsSections, currentAccountSettings);
    lsJSONSet(CACHE_KEY, { t: Date.now(), res: currentAccountSettings });
  }

  async function loadAccountSettings() {
    const now = Date.now();
    const saved = lsJSONGet(CACHE_KEY, null);

    if (saved?.res && (now - saved.t < CACHE_TTL_MS)) {
      currentAccountSettings = saved.res;
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
        currentAccountSettings = res;
        syncUIWithState();
      } else {
        throw new Error(res?.error || "Unknown load error");
      }
    } catch (e) {
      console.warn("[settings] account settings load failed, using cache fallback:", e);
      if (saved?.res) {
        currentAccountSettings = saved.res;
        syncUIWithState();
      }
      hud.error(t("settings.privacy_load_error"));
    }
  }

  async function saveAccountSettingsState(payload) {
    const backupState = { ...currentAccountSettings };

    try {
      const res = await wr.queue("set_privacy", payload, {
        cacheTtlMs: 0,
        cooldownMs: 500,
        timeoutMs: 5_000
      });

      if (!res?.error) {
        if (Object.keys(res).length > 0) currentAccountSettings = res;
        syncUIWithState();
        hud.success(t("settings.privacy_saved"));
      } else {
        throw new Error(res.error);
      }
    } catch (e) {
      currentAccountSettings = backupState;
      syncUIWithState();
      hud.error(t("settings.privacy_save_error"), e);
    }
  }

  async function applyPreset(preset) {
    const flags = applyAccountSettingsPreset(preset, currentAccountSettings);
    if (flags === currentAccountSettings) return;

    currentAccountSettings = flags;
    syncUIWithState();

    try {
      const res = await wr.queue("set_privacy", flags, {
        cacheTtlMs: 0,
        cooldownMs: 500,
        timeoutMs: 5_000
      });

      if (!res?.error) {
        if (Object.keys(res).length > 0) currentAccountSettings = res;
        syncUIWithState();
        hud.success(t("settings.preset_applied"));
      } else {
        throw new Error(res.error);
      }
    } catch (e) {
      hud.error(t("settings.preset_error"));
      const saved = lsJSONGet(CACHE_KEY, null);
      if (saved?.res) {
        currentAccountSettings = saved.res;
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

  buildAccountSettingsDOM();
  await loadAccountSettings();
}