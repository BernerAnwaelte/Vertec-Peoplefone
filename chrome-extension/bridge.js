// Content Script im peoplefone SOFTPHONE-Tab.
//
// Übergibt Wählaufträge an die Softphone-Webapp. Das Nachrichtenformat
// { type: 'CLICK_TO_CALL', tel: '<nummer>' } per window.postMessage ist dasselbe,
// das die offizielle "Peoplefone Softphone Extension" (Chrome Web Store,
// ID egdokdcibedkodjiodgapdplgloblkim, Version 1.0.1.3) verwendet.
// Es ist keine öffentlich dokumentierte API – siehe README, Abschnitt "Grenzen".
(() => {
  if (window.__vertecPeoplefoneBridge) return;
  window.__vertecPeoplefoneBridge = true;

  const send = (msg) => {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (_) {
      // Erweiterung wurde neu geladen – ignorieren
    }
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'VP_DIAL') return false;
    if (msg.confirm && !window.confirm('Nummer ' + msg.tel + ' mit peoplefone anrufen?')) {
      sendResponse({ ok: false, reason: 'abgebrochen' });
      return false;
    }
    window.postMessage({ type: 'CLICK_TO_CALL', tel: msg.tel }, window.location.origin);
    sendResponse({ ok: true });
    return false;
  });

  // Fallback: falls der Service Worker die Navigation verpasst hat
  // (z.B. Chrome wurde gerade erst durch den Aufruf gestartet).
  if (window.location.hash.indexOf('vertec-dial=') >= 0) {
    send({ type: 'VP_URL', url: window.location.href });
  }

  // Softphone ist geladen -> evtl. wartenden Wählauftrag abholen.
  send({ type: 'VP_READY' });

  // Die Softphone-Webapp meldet sich beim Laden mit EXTENSION_CHECK
  // (siehe offizielle Erweiterung) – auch das als "bereit" werten.
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'EXTENSION_CHECK') {
      send({ type: 'VP_READY' });
    }
  });
})();
