const STORAGE_KEY = "lang";
const FALLBACK = "en";
const SUPPORTED_LANGS = ["en", "ru", "es", "lt"];

const NATIVE_LANGUAGE_NAMES = Object.freeze({
  en: "English",
  ru: "Русский",
  es: "Español",
  lt: "Lietuviu"
});

const localeModules = import.meta.glob("../../locales/*.json");

let dict = {};
let fallbackDict = {};
let lang = FALLBACK;
const listeners = new Set();

function normalizeLangCode(value) {
  if (!value) return "";
  const s = String(value).trim().toLowerCase().replace("_", "-");
  if (!s) return "";
  return s.split("-")[0];
}

function isSupportedLang(code) {
  return SUPPORTED_LANGS.includes(code);
}

function resolveLang(code, fallback = FALLBACK) {
  const n = normalizeLangCode(code);
  return isSupportedLang(n) ? n : fallback;
}

function format(str, vars) {
  if (!vars || typeof str !== "string") return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

async function loadLocale(rawCode) {
  const code = resolveLang(rawCode);
  const path = `../../locales/${code}.json`;
  const loader = localeModules[path];

  if (!loader) {
    if (code !== FALLBACK) return loadLocale(FALLBACK);
    return {};
  }

  try {
    const mod = await loader();
    return mod.default ?? mod ?? {};
  } catch (e) {
    console.error("[i18n] failed to load locale", code, e);
    if (code !== FALLBACK) return loadLocale(FALLBACK);
    return {};
  }
}

function detectBrowserLang() {
  try {
    const langs = Array.isArray(navigator?.languages) ? navigator.languages : [];
    for (const candidate of langs) {
      const n = normalizeLangCode(candidate);
      if (isSupportedLang(n)) return n;
    }
    const single = normalizeLangCode(navigator?.language || "");
    if (isSupportedLang(single)) return single;
  } catch {}
  return FALLBACK;
}

function currentVarsForEl(el) {
  try {
    const raw = el?.dataset?.i18nVars;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function notifyLangChanged(nextLang) {
  for (const fn of listeners) {
    try {
      fn(nextLang);
    } catch (e) {
      console.error(e);
    }
  }

  try {
    document.dispatchEvent(new CustomEvent("i18n:change", { detail: { lang: nextLang } }));
  } catch {}
}

function applyDocumentMetaI18n() {
  try {
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
  } catch {}

  try {
    const pid = document.body?.dataset?.page || "";
    const map = {
      "": "page.title.home",
      "profile": "page.title.profile",
      "leaderboard": "page.title.leaderboard",
      "settings": "page.title.settings",
      "server-edit": "page.title.server_edit",
      "privacy": "page.title.privacy",
      "terms-of-service": "page.title.tos",
      "rules": "page.title.rules"
    };
    const key = map[pid];
    if (!key) return;
    document.title = t(key, { site: "Wolium" });
  } catch {}
}

export function getLang() {
  return lang;
}

export function getSupportedLangs() {
  return [...SUPPORTED_LANGS];
}

export function getLanguageNativeName(code) {
  const c = resolveLang(code, normalizeLangCode(code) || FALLBACK);
  return NATIVE_LANGUAGE_NAMES[c] || String(code || "");
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key, vars) {
  const raw = dict[key] ?? fallbackDict[key];
  if (typeof raw === "string") return format(raw, vars);
  return key;
}

export function setTextI18n(el, key, vars) {
  if (!el) return;
  el.textContent = t(key, vars);
}

export async function setLang(nextLang, { save = true } = {}) {
  const resolved = resolveLang(nextLang, FALLBACK);

  if (!Object.keys(fallbackDict).length) {
    fallbackDict = await loadLocale(FALLBACK);
  }

  if (resolved === lang && Object.keys(dict).length) {
    if (save) {
      try {
        localStorage.setItem(STORAGE_KEY, resolved);
      } catch {}
    }
    applyDocumentMetaI18n();
    applyDomI18n(document);
    notifyLangChanged(resolved);
    return;
  }

  dict = await loadLocale(resolved);
  lang = resolved;

  if (save) {
    try {
      localStorage.setItem(STORAGE_KEY, resolved);
    } catch {}
  }

  applyDocumentMetaI18n();
  applyDomI18n(document);
  notifyLangChanged(resolved);
}

export async function initI18n({ defaultLang = FALLBACK } = {}) {
  if (!Object.keys(fallbackDict).length) {
    fallbackDict = await loadLocale(FALLBACK);
  }

  let initial = resolveLang(defaultLang, FALLBACK);

  try {
    const saved = resolveLang(localStorage.getItem(STORAGE_KEY), "");
    if (saved) initial = saved;
    else initial = resolveLang(detectBrowserLang(), initial);
  } catch {
    initial = resolveLang(detectBrowserLang(), initial);
  }

  await setLang(initial, { save: false });
}

export function applyDomI18n(root = document) {
  if (!root || typeof root.querySelectorAll !== "function") return;

  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n, currentVarsForEl(el));
  });

  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml, currentVarsForEl(el));
  });

  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    const rules = String(el.dataset.i18nAttr || "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const rule of rules) {
      const idx = rule.indexOf(":");
      if (idx <= 0) continue;
      const attr = rule.slice(0, idx).trim();
      const key = rule.slice(idx + 1).trim();
      if (!attr || !key) continue;
      el.setAttribute(attr, t(key, currentVarsForEl(el)));
    }
  });
}
