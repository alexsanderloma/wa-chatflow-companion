const test = require('node:test');
const assert = require('node:assert/strict');
const { APP_URL, isAppUrl, isExternalUrl } = require('./policy.cjs');
test('desktop opens only the official hosted FLOWA origin internally', () => {
  assert.equal(APP_URL, 'https://flowa.store');
  for (const url of ['https://flowa.store', 'https://flowa.store/entrar', 'https://flowa.store/app/checkout']) assert.equal(isAppUrl(url), true);
  for (const url of ['http://flowa.store', 'https://flowa.store.evil.test', 'https://flowa.store@evil.test', 'file:///etc/passwd', 'javascript:alert(1)', 'invalid']) assert.equal(isAppUrl(url), false);
});
test('external links never execute privileged or local protocols', () => {
  for (const url of ['https://wa.me/5531973175308', 'https://accounts.google.com', 'mailto:example@example.com', 'tel:+553100000000']) assert.equal(isExternalUrl(url), true);
  for (const url of ['file:///secret', 'javascript:alert(1)', 'data:text/html,hi', 'http://evil.test', 'https://flowa.store/app', 'invalid']) assert.equal(isExternalUrl(url), false);
});