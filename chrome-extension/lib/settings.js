// Standardeinstellungen der Erweiterung. Gespeichert in chrome.storage.local
// (bewusst nicht "sync", damit API-Token und Kopplungscode nicht ins Google-Konto gelangen).
export const DEFAULTS = {
  vertecUrl: '',            // z.B. https://firma.vertec-cloud.ch
  webserviceName: 'peoplefone',
  apiToken: '',             // API-Token des technischen Vertec-Benutzers
  pairingCode: '',          // persönlicher Kopplungscode "<objid>-<geheimnis>"
  pollMs: 2000,
  countryCode: '41',
  delayMs: 4000,
  confirmBeforeDial: false,
  // Schweizer Mehrwertdienstnummern (0900/0901/0906) standardmässig gesperrt
  blockedPrefixes: ['+41900', '+41901', '+41906'],
  softphoneUrl: 'https://softphone.peoplefone.com/',
};

export const SOFTPHONE_HOSTS = ['softphone.peoplefone.com', 'softphone-rc.peoplefone.com', 'webrtc.peoplefone.ch'];
export const SOFTPHONE_PATTERNS = SOFTPHONE_HOSTS.map((h) => `https://${h}/*`);

export async function getSettings() {
  return chrome.storage.local.get(DEFAULTS);
}
