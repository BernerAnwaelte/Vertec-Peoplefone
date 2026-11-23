# -*- coding: utf-8 -*-
"""
Vertec-Skript "Mit peoplefone anrufen"

Registrierung in Vertec (Administratorrechte nötig):
  Einstellungen > Reports & Scripts > Scripts > Rechtsklick > Neu > Script
    - Bezeichnung:            Mit peoplefone anrufen
    - In Vertec-Menüs anzeigen: [x]
    - Plattform:              Python 3
    - Klassen:                siehe README (Adressklassen und/oder Kommunikationsmittel)
    - Anzeigebedingung:       self->size = 1
    - Skripttext:             Inhalt dieser Datei

Funktionsweise:
  Das Skript ermittelt die Telefonnummer(n) des gewählten Objekts, bringt sie ins
  internationale Format (+41...) und öffnet auf dem Client
      https://softphone.peoplefone.com/#vertec-dial=<nummer>&k=<token>
  Die Chrome-Erweiterung "Vertec -> peoplefone Wählhilfe" übernimmt den Rest
  (Softphone öffnen bzw. vorhandenen Tab nutzen und wählen).

Verwendete, in der Vertec Knowledge Base dokumentierte Funktionen:
  vtcapp.executeurl, vtcapp.executefile, vtcapp.msgbox, vtcapp.inputbox,
  OCL "kommMittel", Attribut "zieladresse", Variable "selectedobjects".
"""

import re

try:  # Python 3
    from urllib.parse import quote
except ImportError:  # pragma: no cover - Python 2 (Vertec-Kompatibilitätsmodus)
    from urllib import quote

# ===================== Konfiguration =====================
# Muss identisch sein mit dem Token in den Einstellungen der Chrome-Erweiterung.
TOKEN = "HIER-DEN-TOKEN-AUS-DER-CHROME-ERWEITERUNG-EINTRAGEN"

# Landesvorwahl für nationale Nummern (031 ... -> +4131 ...)
LANDESVORWAHL = "41"

# Adresse des peoplefone SOFTPHONE
SOFTPHONE_URL = "https://softphone.peoplefone.com/"

# Leer lassen  -> URL wird mit vtcapp.executeurl im Standardbrowser geöffnet
#                 (Chrome muss dann der Standardbrowser sein).
# Pfad angeben -> Chrome wird direkt gestartet (vtcapp.executefile), z.B.
#   r"C:\Program Files\Google\Chrome\Application\chrome.exe"
#   Beim ersten Mal fragt Vertec, ob die Datei ausgeführt werden darf.
CHROME_PFAD = ""
# =========================================================

DIAL_PARAM = "vertec-dial"
TOKEN_PARAM = "k"


def normalisiere_nummer(roh, landesvorwahl=LANDESVORWAHL):
    """Gleiche Logik wie normalizeNumber() in chrome-extension/lib/phone.js."""
    if roh is None:
        return None
    s = str(roh).strip()
    s = re.sub(r"^(tel|callto|sip):", "", s, flags=re.IGNORECASE)
    s = s.replace("(0)", "")
    hat_plus = s.strip().startswith("+")
    ziffern = re.sub(r"[^\d]", "", s)
    if not ziffern:
        return None
    if hat_plus:
        ergebnis = "+" + ziffern
    elif ziffern.startswith("00"):
        ergebnis = "+" + ziffern[2:]
    elif ziffern.startswith("0"):
        cc = re.sub(r"[^\d]", "", str(landesvorwahl or ""))
        if not cc:
            return None
        ergebnis = "+" + cc + ziffern[1:]
    else:
        ergebnis = ziffern  # interne Nebenstelle
    if re.match(r"^\+?\d{2,20}$", ergebnis):
        return ergebnis
    return None


def sieht_wie_telefonnummer_aus(text):
    """Filtert E-Mail-Adressen, Webseiten usw. aus den Kommunikationsmitteln heraus."""
    if not text:
        return False
    t = str(text).strip()
    if "@" in t or "://" in t or t.lower().startswith("www."):
        return False
    if re.search(r"[A-Za-z]", re.sub(r"^(tel|callto|sip):", "", t, flags=re.IGNORECASE)):
        return False
    return len(re.sub(r"[^\d]", "", t)) >= 3


def baue_url(nummer, token=TOKEN, basis=SOFTPHONE_URL):
    """Gleiches Format wie buildDialUrl() in chrome-extension/lib/phone.js."""
    return "{0}#{1}={2}&{3}={4}".format(
        basis, DIAL_PARAM, quote(nummer, safe=""), TOKEN_PARAM, quote(token, safe="")
    )


def _attr(obj, name):
    try:
        return getattr(obj, name)
    except Exception:
        return None


def _text(obj, ocl):
    try:
        wert = obj.evalocl(ocl)
        return "" if wert is None else str(wert)
    except Exception:
        return ""


def nummern_von_objekt(obj):
    """
    Liefert eine Liste von (Beschriftung, Nummer) für das gewählte Objekt.
      - Kommunikationsmittel: dessen "zieladresse"
      - Adresse (Person, Firma, Kontakt ...): alle Kommunikationsmittel ("kommMittel"),
        die wie Telefonnummern aussehen
    """
    ziel = _attr(obj, "zieladresse")
    if ziel is not None:
        return [("", str(ziel))] if sieht_wie_telefonnummer_aus(ziel) else []

    try:
        kommmittel = obj.evalocl("kommMittel")
    except Exception:
        kommmittel = None

    resultat = []
    for km in (kommmittel or []):
        ziel = _attr(km, "zieladresse")
        if not sieht_wie_telefonnummer_aus(ziel):
            continue
        beschriftung = _text(km, "bezeichnung") or _text(km, "typ.asstring")
        resultat.append((beschriftung, str(ziel)))
    return resultat


def waehle_nummer(nummern, vtcapp):
    """Bei mehreren Nummern den Benutzer auswählen lassen. Gibt die Rohnummer oder None zurück."""
    if not nummern:
        return None
    if len(nummern) == 1:
        return nummern[0][1]
    zeilen = []
    for i, (beschriftung, nummer) in enumerate(nummern, 1):
        zeilen.append("{0}: {1}{2}".format(i, nummer, " ({0})".format(beschriftung) if beschriftung else ""))
    antwort = vtcapp.inputbox(
        "Mit peoplefone anrufen",
        "Welche Nummer soll gewählt werden?\n\n" + "\n".join(zeilen),
        "1",
    )
    if not antwort:
        return None
    try:
        index = int(str(antwort).strip()) - 1
    except ValueError:
        return None
    if 0 <= index < len(nummern):
        return nummern[index][1]
    return None


def oeffne_url(url, vtcapp):
    if CHROME_PFAD:
        vtcapp.executefile(CHROME_PFAD, '"{0}"'.format(url))
    else:
        vtcapp.executeurl(url)


def main(objekte):
    import vtcapp

    if not TOKEN or TOKEN.startswith("HIER-"):
        vtcapp.msgbox("Bitte zuerst den TOKEN im Skript 'Mit peoplefone anrufen' eintragen.")
        return
    objekte = list(objekte or [])
    if len(objekte) != 1:
        vtcapp.msgbox("Bitte genau einen Eintrag auswählen.")
        return

    nummern = nummern_von_objekt(objekte[0])
    if not nummern:
        vtcapp.msgbox("Für diesen Eintrag ist keine Telefonnummer hinterlegt.")
        return

    roh = waehle_nummer(nummern, vtcapp)
    if roh is None:
        return
    nummer = normalisiere_nummer(roh, LANDESVORWAHL)
    if not nummer:
        vtcapp.msgbox("Die Nummer '{0}' konnte nicht erkannt werden.".format(roh))
        return

    oeffne_url(baue_url(nummer, TOKEN, SOFTPHONE_URL), vtcapp)


# Einstieg, wenn Vertec das Skript ausführt.
# "selectedobjects" ab Vertec 6.7.0.12, "argobject" bei älteren Versionen.
if "selectedobjects" in globals():
    main(globals()["selectedobjects"])
elif "argobject" in globals():
    main([globals()["argobject"]])
