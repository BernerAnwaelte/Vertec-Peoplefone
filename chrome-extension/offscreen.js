// Unsichtbares Offscreen-Dokument: hält den Service Worker aktiv und löst
// regelmässig die Abfrage des Vertec-Webservice aus (siehe background.js).
setInterval(() => {
  chrome.runtime.sendMessage({ type: 'VP_TICK' }).catch(() => {});
}, 1000);
