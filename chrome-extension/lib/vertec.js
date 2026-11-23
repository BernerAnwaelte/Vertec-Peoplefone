// Zugriff auf den Vertec-Webservice (vertec/peoplefone_webservice.py).

/** https://host[/] + /api/webservice/<name>/<alias>  (Format laut Vertec KB "Custom web services") */
export function endpointUrl(vertecUrl, serviceName, alias) {
  const base = String(vertecUrl || '').trim().replace(/\/+$/, '');
  return `${base}/api/webservice/${encodeURIComponent(serviceName)}/${alias}`;
}

/** Ursprung (für die Host-Berechtigung), z.B. "https://firma.vertec-cloud.ch/*" oder null. */
export function originPattern(vertecUrl) {
  try {
    const u = new URL(String(vertecUrl).trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.protocol}//${u.host}/*`;
  } catch (_) {
    return null;
  }
}

/** Antwort von GET .../auftrag -> {id, tel} oder null, wenn kein (gültiger) Auftrag vorliegt. */
export function parseOrder(json) {
  if (!json || typeof json !== 'object') return null;
  const { id, tel } = json;
  if (!id || typeof id !== 'string' || !tel || typeof tel !== 'string') return null;
  return { id, tel };
}

export function requestHeaders(settings) {
  return {
    Authorization: 'Bearer ' + settings.apiToken,
    'X-Peoplefone-Code': settings.pairingCode,
    Accept: 'application/json',
  };
}

/** Ruft einen Endpunkt auf; wirft bei HTTP-Fehlern einen Error mit verständlicher Meldung. */
export async function callService(settings, alias, fetchImpl = fetch) {
  const res = await fetchImpl(endpointUrl(settings.vertecUrl, settings.webserviceName, alias), {
    method: 'GET',
    headers: requestHeaders(settings),
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!res.ok) {
    const hints = {
      401: 'API-Token ungültig',
      403: 'Kopplungscode ungültig oder keine Berechtigung',
      404: 'Webservice nicht gefunden (Name/aktiv?)',
    };
    throw new Error(`HTTP ${res.status}` + (hints[res.status] ? ` – ${hints[res.status]}` : ''));
  }
  return res.json();
}
