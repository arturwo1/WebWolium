import { t } from '@/lib/text/i18n.js';

export function createBanner(onAccept, onDecline) {

  const banner = document.createElement('div');
  banner.className = 'banner';

  banner.innerHTML = `
    <div class="banner__panel">
      ${t('cookie.text')}
      <div class="dd-sep"></div>
      <button class="dd-item" id="cookie-accept">${t('cookie.accept')}</button>
      <button class="dd-item" id="cookie-decline">${t('cookie.decline')}</button>
    </div>
  `;

  document.body.appendChild(banner);

  document.getElementById('cookie-accept').onclick = () => {
    banner.remove();
    onAccept();
  };

  document.getElementById('cookie-decline').onclick = () => {
    banner.remove();
    onDecline();
  };
}