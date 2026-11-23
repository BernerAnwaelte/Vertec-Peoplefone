// Service Worker der Erweiterung "Vertec → peoplefone Wählhilfe".
//
// Ablauf:
//  1. Vertec (oder der Windows-tel:-Handler) öffnet in Chrome eine URL wie
//       https://softphone.peoplefone.com/#vertec-dial=%2B41441234567&k=<TOKEN>
//  2. Diese Erweiterung erkennt die Navigation, prüft Token und Nummer.
//  3a. Ist das Softphone bereits in einem anderen Tab offen: neuen Tab schliessen,
//      Softphone-Tab in den Vordergrund holen und die Nummer wählen.
//  3b. Sonst: neuen Tab auf die "saubere" Softphone-URL umleiten (Token weg),
//      warten bis das Softphone geladen ist (ggf. nach Login) und dann wählen.

import { normalizeNumber, isBlocked, parseDialUrl, safeEqual } from './lib/phone.js';
import { DEFAULTS } from './lib/settings.js';

const SOFTPHONE_PATTERNS = [
  'https://softphone.peoplefone.com/*',
  'https://softphone-rc.peoplefone.com/*',
  'https://webrtc.peoplefone.ch/*',
];
const SOFTPHONE_HOSTS = ['softphone.peoplefone.com', 'softphone-rc.peoplefone.com', 'webrtc.peoplefone.ch'];

const PENDING_TTL_MS = 3 * 60 * 1000; // so lange darf ein Login dauern
const DEDUP_MS = 60 * 1000;

// Synchrone Dublettenprüfung (mehrere Listener können dieselbe Navigation melden).
const seen = new Map();
// Tabs, für die gerade ein Wählauftrag zugestellt wird.
const inFlight = new Set();

function markSeen(key) {
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > DEDUP_MS) seen.delete(k);
  if (seen.has(key)) return false;
  seen.set(key, now);
  return true;
}

async function getSettings() {
  return chrome.storage.sync.get(DEFAULTS);
}

function notify(message, title = 'Vertec → peoplefone') {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon128.png',
    title,
    message,
    priority: 1,
  }).catch(() => {});
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendDial(tabId, tel, settings) {
  const msg = { type: 'VP_DIAL', tel, confirm: !!settings.confirmBeforeDial };
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch (_) {
    // Content Script fehlt (z.B. Tab war schon vor der Installation offen) -> nachladen.
    await chrome.scripting.executeScript({ target: { tabId }, files: ['bridge.js'] });
    return chrome.tabs.sendMessage(tabId, msg);
  }
}

async function getPending() {
  const { pending = {} } = await chrome.storage.session.get('pending');
  const now = Date.now();
  for (const id of Object.keys(pending)) {
    if (now - pending[id].ts > PENDING_TTL_MS) delete pending[id];
  }
  return pending;
}

async function setPending(tabId, tel) {
  const pending = await getPending();
  pending[tabId] = { tel, ts: Date.now() };
  await chrome.storage.session.set({ pending });
}

async function clearPending(tabId) {
  const pending = await getPending();
  delete pending[tabId];
  await chrome.storage.session.set({ pending });
}

async function handleDialUrl(tabId, url) {
  const req = parseDialUrl(url);
  if (!req) return;
  if (!markSeen(tabId + '|' + req.raw)) return;

  const s = await getSettings();

  if (!s.token || !safeEqual(req.token, s.token)) {
    await chrome.tabs.update(tabId, { url: s.softphoneUrl }).catch(() => {});
    notify('Wählauftrag abgelehnt: Token fehlt oder stimmt nicht. Bitte in den Einstellungen der Erweiterung prüfen.');
    return;
  }

  const tel = normalizeNumber(req.number, s.countryCode);
  if (!tel) {
    await chrome.tabs.update(tabId, { url: s.softphoneUrl }).catch(() => {});
    notify('Ungültige Telefonnummer: ' + req.number);
    return;
  }
  if (isBlocked(tel, s.blockedPrefixes)) {
    await chrome.tabs.update(tabId, { url: s.softphoneUrl }).catch(() => {});
    notify('Nummer ' + tel + ' ist gesperrt (Mehrwertnummer?). Siehe Einstellungen.');
    return;
  }

  const others = (await chrome.tabs.query({ url: SOFTPHONE_PATTERNS })).filter((t) => t.id !== tabId);

  if (others.length > 0) {
    // 3a: Softphone läuft schon -> diesen Tab verwenden.
    const target = others.find((t) => t.active) || others[0];
    await chrome.tabs.remove(tabId).catch(() => {});
    await chrome.windows.update(target.windowId, { focused: true }).catch(() => {});
    await chrome.tabs.update(target.id, { active: true }).catch(() => {});
    try {
      await sendDial(target.id, tel, s);
    } catch (e) {
      notify('Konnte die Nummer nicht an das Softphone übergeben: ' + (e && e.message ? e.message : e));
    }
    return;
  }

  // 3b: Softphone ist noch nicht offen -> in diesem Tab laden und danach wählen.
  await setPending(tabId, tel);
  await chrome.tabs.update(tabId, { url: s.softphoneUrl, active: true }).catch(() => {});
}

async function handleReady(tabId) {
  if (inFlight.has(tabId)) return;
  const pending = await getPending();
  const job = pending[tabId];
  if (!job) return;

  inFlight.add(tabId);
  try {
    const s = await getSettings();
    await sleep(Math.max(0, Number(s.delayMs) || 0)); // Softphone braucht Zeit zur Registrierung
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || !tab.url) return;
    const host = new URL(tab.url).hostname;
    if (!SOFTPHONE_HOSTS.includes(host)) return; // z.B. noch auf der Login-Seite
    const res = await sendDial(tabId, job.tel, s).catch(() => null);
    if (res) await clearPending(tabId); // sonst beim nächsten READY erneut versuchen
  } finally {
    inFlight.delete(tabId);
  }
}

// --- Listener (müssen synchron auf oberster Ebene registriert werden) ---

const navFilter = { url: SOFTPHONE_HOSTS.map((h) => ({ hostEquals: h })) };

chrome.webNavigation.onBeforeNavigate.addListener((d) => {
  if (d.frameId === 0) handleDialUrl(d.tabId, d.url);
}, navFilter);

chrome.webNavigation.onReferenceFragmentUpdated.addListener((d) => {
  if (d.frameId === 0) handleDialUrl(d.tabId, d.url);
}, navFilter);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) handleDialUrl(tabId, changeInfo.url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearPending(tabId).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab || sender.id !== chrome.runtime.id || !msg) return false;
  if (msg.type === 'VP_URL') handleDialUrl(sender.tab.id, msg.url);
  if (msg.type === 'VP_READY') handleReady(sender.tab.id);
  return false;
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== 'install') return;
  const s = await getSettings();
  if (!s.token) chrome.runtime.openOptionsPage();
});
