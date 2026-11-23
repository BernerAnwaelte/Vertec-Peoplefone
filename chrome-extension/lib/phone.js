// Gemeinsame Hilfsfunktionen für Telefonnummern und Wähl-URLs.
// Wird vom Service Worker (background.js) importiert und in den Tests geprüft.

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
