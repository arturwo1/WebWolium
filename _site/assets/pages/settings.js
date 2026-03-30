import { getLang, setLang, onLangChange, getSupportedLangs, getLanguageNativeName, warmLanguageNativeNames } from "@/lib/text/i18n.js";
import { grantConsent, denyConsent } from '@/lib/consent/google.js';

const $lang = document.querySelector("[data-lang-select]");

function languageLabel(code) {
  return getLanguageNativeName(code);
}

async function syncLangSelect() {
  const uiLang = getLang();
  const supported = new Set(getSupportedLangs());

  for (const opt of [...$lang.options]) {
    if (!supported.has(opt.value)) opt.remove();
  }

  await warmLanguageNativeNames();

  $lang.value = uiLang;

  for (const opt of $lang.options) {
    opt.textContent = languageLabel(opt.value);
  }
}

export async function initSettingsPage() {
  await syncLangSelect();

  onLangChange(() => {
    syncLangSelect();
  });

  $lang.addEventListener("change", async () => {
    await setLang($lang.value);
    await syncLangSelect();
  });

  const c = document.getElementById("cookie-consent");
  c.checked = localStorage.getItem("cookie-consent") === "granted";
  c.onchange = () => {
    localStorage.setItem(
      "cookie-consent",
      c.checked ? "granted" : "denied"
    );
    c.checked ? grantConsent() : denyConsent();
  };
};