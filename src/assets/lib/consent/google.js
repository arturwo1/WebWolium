export const GA_ID = 'G-NL5JFYRXCQ';

function safeGtag() {
  if (typeof window.gtag === 'function') {
    window.gtag(...arguments);
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(arguments);
}

export function grantConsent() {
  safeGtag('consent', 'update', {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted'
  });

  safeGtag('config', GA_ID);
}

export function denyConsent() {
  safeGtag('consent', 'update', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  });
}