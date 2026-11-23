// Gemeinsame Hilfsfunktionen für Telefonnummern und Wähl-URLs.
// Wird vom Service Worker (background.js) importiert und in den Tests geprüft.

export const DIAL_PARAM = 'vertec-dial';
export const TOKEN_PARAM = 'k';

/**
 * Bringt eine Telefonnummer in die Form, die das peoplefone SOFTPHONE erwartet.
 *  - "tel:", "callto:", "sip:" werden entfernt
 *  - "(0)" wird entfernt, ebenso Leerzeichen, Bindestriche, Punkte, Klammern
 *  - "00..." wird zu "+..."
 *  - "0..." (nationale Nummer) wird zu "+<Landesvorwahl>..."
 *  - Nummern ohne führende 0 / + (z.B. interne Nebenstellen "202") bleiben unverändert
 * Gibt null zurück, wenn keine gültige Nummer erkannt wird.
 */
export function normalizeNumber(raw, countryCode = '41') {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  try {
    s = decodeURIComponent(s);
  } catch (_) {
    // bereits dekodiert
  }
  s = s.replace(/^(tel|callto|sip):/i, '');
  s = s.replace(/\(0\)/g, '');
  const hasPlus = s.trim().startsWith('+');
  let digits = s.replace(/[^\d]/g, '');
  if (!digits) return null;

  let result;
  if (hasPlus) {
    result = '+' + digits;
  } else if (digits.startsWith('00')) {
    result = '+' + digits.slice(2);
  } else if (digits.startsWith('0')) {
    const cc = String(countryCode || '').replace(/[^\d]/g, '');
    if (!cc) return null;
    result = '+' + cc + digits.slice(1);
  } else {
    result = digits; // interne Nebenstelle o.ä.
  }
  return /^\+?\d{2,20}$/.test(result) ? result : null;
}

/** Prüft, ob die (normalisierte) Nummer mit einem gesperrten Präfix beginnt. */
export function isBlocked(number, blockedPrefixes = []) {
  if (!number) return true;
  return blockedPrefixes
    .map((p) => String(p).trim())
    .filter(Boolean)
    .some((p) => number.startsWith(p));
}

/**
 * Liest Nummer und Token aus einer URL wie
 *   https://softphone.peoplefone.com/#vertec-dial=%2B41441234567&k=GEHEIM
 * Gibt {number, token, raw} oder null zurück.
 */
export function parseDialUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch (_) {
    return null;
  }
  const hash = (u.hash || '').replace(/^#/, '');
  if (!hash.includes(DIAL_PARAM + '=')) return null;
  const params = new URLSearchParams(hash);
  // URLSearchParams wandelt "+" in Leerzeichen um -> zurückwandeln
  const number = (params.get(DIAL_PARAM) || '').replace(/ /g, '+');
  if (!number) return null;
  return { number, token: params.get(TOKEN_PARAM) || '', raw: hash };
}

/** Baut die Wähl-URL (gleiches Format wie Vertec-Skript und Windows-Handler). */
export function buildDialUrl(baseUrl, number, token) {
  return (
    baseUrl +
    '#' + DIAL_PARAM + '=' + encodeURIComponent(number) +
    '&' + TOKEN_PARAM + '=' + encodeURIComponent(token)
  );
}

/** Vergleicht zwei Strings in konstanter Zeit (gegen Timing-Angriffe auf das Token). */
export function safeEqual(a, b) {
  a = String(a || '');
  b = String(b || '');
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
