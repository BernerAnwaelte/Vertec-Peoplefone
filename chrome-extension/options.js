import { DEFAULTS, SOFTPHONE_HOSTS, getSettings } from './lib/settings.js';
import { callService, originPattern } from './lib/vertec.js';

const $ = (id) => document.getElementById(id);

function show(text, ok) {
  $('status').className = ok ? 'ok' : 'err';
  $('status').textContent = text;
}

async function load() {
  const s = await getSettings();
  $('vertecUrl').value = s.vertecUrl;
  $('webserviceName').value = s.webserviceName;
  $('apiToken').value = s.apiToken;
  $('pairingCode').value = s.pairingCode;
  $('countryCode').value = s.countryCode;
  $('delayMs').value = s.delayMs;
  $('pollMs').value = s.pollMs;
  $('confirmBeforeDial').checked = !!s.confirmBeforeDial;
  $('blockedPrefixes').value = (s.blockedPrefixes || []).join('\n');
  $('softphoneUrl').value = s.softphoneUrl;
}

async function save() {
  // Die Berechtigung muss direkt im Klick angefragt werden (Chrome verlangt eine Benutzeraktion).
  const vertecUrl = $('vertecUrl').value.trim().replace(/\/+$/, '');
  const origin = originPattern(vertecUrl);
  if (!origin || !vertecUrl.startsWith('https://')) {
    show('Bitte eine gültige Vertec-Adresse mit https:// eingeben.', false);
    return;
  }
  const granted = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
  if (!granted) {
    show('Ohne Zugriffsrecht auf ' + origin.replace('/*', '') + ' kann die Erweiterung Vertec nicht abfragen.', false);
    return;
  }

  let softphoneUrl = $('softphoneUrl').value.trim() || DEFAULTS.softphoneUrl;
  try {
    const u = new URL(softphoneUrl);
    if (u.protocol !== 'https:' || !SOFTPHONE_HOSTS.includes(u.hostname)) throw new Error();
    softphoneUrl = u.origin + u.pathname;
  } catch (_) {
    show('Ungültige Softphone-Adresse.', false);
    return;
  }

  const settings = {
    vertecUrl,
    webserviceName: $('webserviceName').value.trim() || DEFAULTS.webserviceName,
    apiToken: $('apiToken').value.trim(),
    pairingCode: $('pairingCode').value.trim(),
    countryCode: $('countryCode').value.replace(/[^\d]/g, '') || DEFAULTS.countryCode,
    delayMs: Math.max(0, parseInt($('delayMs').value, 10) || 0),
    pollMs: Math.max(1000, parseInt($('pollMs').value, 10) || DEFAULTS.pollMs),
    confirmBeforeDial: $('confirmBeforeDial').checked,
    blockedPrefixes: $('blockedPrefixes').value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
    softphoneUrl,
  };
  await chrome.storage.local.set(settings);

  if (!settings.apiToken || !settings.pairingCode) {
    show('Gespeichert. Es fehlen noch API-Token und/oder Kopplungscode.', false);
    return;
  }
  show('Gespeichert. Teste Verbindung …', true);
  try {
    await callService(settings, 'ping');
    show('Gespeichert. Verbindung zu Vertec funktioniert.', true);
  } catch (e) {
    show('Gespeichert, aber Verbindungstest fehlgeschlagen: ' + (e.message || e), false);
  }
  chrome.runtime.sendMessage({ type: 'VP_SETTINGS_CHANGED' }).catch(() => {});
}

$('save').addEventListener('click', save);
load();
