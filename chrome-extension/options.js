import { DEFAULTS } from './lib/settings.js';

const $ = (id) => document.getElementById(id);

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  $('token').value = s.token;
  $('countryCode').value = s.countryCode;
  $('delayMs').value = s.delayMs;
  $('confirmBeforeDial').checked = !!s.confirmBeforeDial;
  $('blockedPrefixes').value = (s.blockedPrefixes || []).join('\n');
  $('softphoneUrl').value = s.softphoneUrl;
}

async function save() {
  let softphoneUrl = $('softphoneUrl').value.trim() || DEFAULTS.softphoneUrl;
  let host;
  try {
    const u = new URL(softphoneUrl);
    host = u.hostname;
    softphoneUrl = u.origin + u.pathname;
  } catch (_) {
    host = '';
  }
  if (!['softphone.peoplefone.com', 'softphone-rc.peoplefone.com', 'webrtc.peoplefone.ch'].includes(host)) {
    $('status').style.color = '#b00020';
    $('status').textContent = 'Ungültige Softphone-Adresse.';
    return;
  }
  await chrome.storage.sync.set({
    token: $('token').value.trim(),
    countryCode: $('countryCode').value.replace(/[^\d]/g, '') || DEFAULTS.countryCode,
    delayMs: Math.max(0, parseInt($('delayMs').value, 10) || 0),
    confirmBeforeDial: $('confirmBeforeDial').checked,
    blockedPrefixes: $('blockedPrefixes').value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
    softphoneUrl,
  });
  $('status').style.color = '';
  $('status').textContent = 'Gespeichert.';
  setTimeout(() => ($('status').textContent = ''), 2500);
}

$('gen').addEventListener('click', () => ($('token').value = randomToken()));
$('save').addEventListener('click', save);
load();
