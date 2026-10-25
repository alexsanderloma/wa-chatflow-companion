const APP_URL = 'https://flowa.store';
const APP_ORIGIN = new URL(APP_URL).origin;

function isAppUrl(value) {
  try { return new URL(value).origin === APP_ORIGIN; } catch { return false; }
}

function isExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'mailto:', 'tel:'].includes(url.protocol) && !isAppUrl(value);
  } catch { return false; }
}

module.exports = { APP_URL, isAppUrl, isExternalUrl };