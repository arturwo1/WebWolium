import { grantConsent, denyConsent } from './google.js';

const KEY = 'cookie-consent';

export async function initConsent() {

  const saved = localStorage.getItem(KEY);

  if (saved === 'granted') {
    grantConsent();
    return;
  }

  if (saved === 'denied') {
    denyConsent();
    return;
  }
  try {

    const mod = await import('@/lib/ui/cookieBanner.js');
    const createBanner = mod.createBanner;

    createBanner(
      () => {
        localStorage.setItem(KEY, 'granted');
        grantConsent();
      },
      () => {
        localStorage.setItem(KEY, 'denied');
        denyConsent();
      }
    );

  } catch (e) {
    console.warn('Cookie banner blocked by adblock');
  }
}