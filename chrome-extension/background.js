// Service Worker der Erweiterung "Vertec → peoplefone Wählhilfe".
//
// Ablauf:
//  1. In Vertec (läuft im RDS) wählt man "Mit peoplefone anrufen". Das Vertec-Skript
//     speichert den Wählauftrag beim angemeldeten Benutzer.
//  2. Diese Erweiterung (lokaler PC) fragt alle ~2 s den Vertec-Webservice ab
//     (GET /api/webservice/peoplefone/auftrag).
//  3. Neuer Auftrag -> Softphone-Tab suchen (oder öffnen), in den Vordergrund holen
//     und die Nummer an das peoplefone SOFTPHONE übergeben.
//
// Ein MV3-Service-Worker wird nach ~30 s Inaktivität beendet. Deshalb sendet ein
// Offscreen-Dokument (offscreen.html) jede Sekunde einen "Tick"; jede Nachricht hält
// den Service Worker aktiv und löst bei Bedarf eine Abfrage aus.

import { normalizeNumber, isBlocked } from './lib/phone.js';
import { getSettings, SOFTPHONE_HOSTS, SOFTPHONE_PATTERNS } from './lib/settings.js';
import { callService, parseOrder } from './lib/vertec.js';

const PENDING_TTL_MS = 3 * 60 * 1000; // so lange darf ein Softphone-Login dauern

let lastPoll = 0;
let polling = false;
const inFlight = new Set();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function notify(message, title = 'Vertec → peoplefone') {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icon128.png', title, message, priority: 1 })
    .catch(() => {});
}

// ---------- Status-Anzeige am Erweiterungssymbol ----------

let lastStatus = '';
function setStatus(kind, detail = '') {
  const key = kind + detail;
  if (key === lastStatus) return;
  lastStatus = key;
  const texts = {
    ok: ['', 'Verbunden mit Vertec – bereit'],
    config: ['?', 'Nicht eingerichtet – Klick öffnet die Einstellungen'],
    error: ['!', 'Keine Verbindung zu Vertec: ' + detail],
  };
  const [badge, title] = texts[kind] || ['', ''];
  chrome.action.setBadgeText({ text: badge }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: kind === 'error' ? '#b00020' : '#777' }).catch(() => {});
  chrome.action.setTitle({ title: 'Vertec → peoplefone Wählhilfe\n' + title }).catch(() => {});
  chrome.storage.session.set({ status: { kind, detail, at: Date.now() } }).catch(() => {});
}

// ---------- Übergabe an das Softphone ----------

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

/** Wählt eine Nummer: vorhandenen Softphone-Tab nutzen oder Softphone öffnen. */
export async function dialNumber(rawNumber, s) {
  const tel = normalizeNumber(rawNumber, s.countryCode);
  if (!tel) {
    notify('Ungültige Telefonnummer: ' + rawNumber);
    return;
  }
  if (isBlocked(tel, s.blockedPrefixes)) {
    notify('Nummer ' + tel + ' ist gesperrt (Mehrwertnummer?). Siehe Einstellungen.');
    return;
  }

  const tabs = await chrome.tabs.query({ url: SOFTPHONE_PATTERNS });
  if (tabs.length > 0) {
    const target = tabs.find((t) => t.active) || tabs[0];
    await chrome.windows.update(target.windowId, { focused: true, drawAttention: true }).catch(() => {});
    await chrome.tabs.update(target.id, { active: true }).catch(() => {});
    try {
      await sendDial(target.id, tel, s);
    } catch (e) {
      notify('Konnte die Nummer nicht an das Softphone übergeben: ' + (e && e.message ? e.message : e));
    }
    return;
  }

  // Softphone ist nicht offen -> öffnen; gewählt wird, sobald es geladen ist (handleReady).
  // Ist kein Chrome-Fenster offen (Chrome läuft nur im Hintergrund), schlägt tabs.create fehl
  // -> dann ein neues Fenster öffnen.
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] }).catch(() => []);
  let tab;
  if (windows.length > 0) {
    tab = await chrome.tabs.create({ url: s.softphoneUrl, active: true });
  } else {
    const win = await chrome.windows.create({ url: s.softphoneUrl, focused: true });
    tab = win.tabs[0];
  }
  await setPending(tab.id, tel);
  await chrome.windows.update(tab.windowId, { focused: true, drawAttention: true }).catch(() => {});
}

async function handleReady(tabId) {
  if (inFlight.has(tabId)) return;
  const pending = await getPending();
  const job = pending[tabId];
  if (!job) return;

  inFlight.add(tabId);
  try {
    const s = await getSettings();
    await sleep(Math.max(0, Number(s.delayMs) || 0)); // Softphone braucht Zeit zur Anmeldung
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || !tab.url) return;
    if (!SOFTPHONE_HOSTS.includes(new URL(tab.url).hostname)) return; // z.B. noch Login-Seite
    const res = await sendDial(tabId, job.tel, s).catch(() => null);
    if (res) await clearPending(tabId); // sonst beim nächsten READY erneut versuchen
  } finally {
    inFlight.delete(tabId);
  }
}

// ---------- Abfrage des Vertec-Webservice ----------

export async function poll(force = false) {
  const s = await getSettings();
  if (!s.vertecUrl || !s.apiToken || !s.pairingCode) {
    setStatus('config');
    return;
  }
  const now = Date.now();
  if (polling || (!force && now - lastPoll < Math.max(500, Number(s.pollMs) || 2000))) return;
  polling = true;
  lastPoll = now;
  try {
    const order = parseOrder(await callService(s, 'auftrag'));
    setStatus('ok');
    if (!order) return;
    const { lastOrderId } = await chrome.storage.local.get('lastOrderId');
    if (order.id === lastOrderId) return; // bereits gewählt
    await chrome.storage.local.set({ lastOrderId: order.id });
    await dialNumber(order.tel, s);
  } catch (e) {
    setStatus('error', e && e.message ? e.message : String(e));
  } finally {
    polling = false;
  }
}

async function ensureOffscreen() {
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length > 0) return;
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Regelmässige Abfrage von Wählaufträgen aus Vertec',
    });
  } catch (_) {
    // existiert bereits (Wettlauf) – ignorieren
  }
}

// ---------- Listener (synchron auf oberster Ebene registrieren) ----------

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id || !msg) return false;
  if (msg.type === 'VP_TICK') poll();
  if (msg.type === 'VP_READY' && sender.tab) handleReady(sender.tab.id);
  if (msg.type === 'VP_SETTINGS_CHANGED') {
    lastStatus = '';
    poll(true);
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearPending(tabId).catch(() => {});
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onStartup.addListener(ensureOffscreen);
chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureOffscreen();
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

ensureOffscreen();
