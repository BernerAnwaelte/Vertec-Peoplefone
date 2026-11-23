# -*- coding: utf-8 -*-
"""
Vertec-Skript "Mit peoplefone anrufen"  (Menüeintrag)

Registrierung (Administratorrechte nötig), siehe README:
  Einstellungen > Reports & Scripts > Scripts > Rechtsklick > Neu > Script
    Bezeichnung:               Mit peoplefone anrufen
    In Vertec-Menüs anzeigen:  [x]
    Plattform:                 Python 3
    Klassen:                   Adressklassen (und ggf. Kommunikationsmittel)
    Anzeigebedingung:          self->size = 1
    Erweiterte Berechtigungen: [x]   (nur nötig, falls Benutzer den eigenen Benutzereintrag
                                      nicht ändern dürfen; siehe schreibe_key)
    Skripttext:                Inhalt dieser Datei

Ablauf:
  1. Nummer(n) des gewählten Eintrags ermitteln, ggf. Auswahl anzeigen.
  2. Nummer ins internationale Format bringen (+41...).
  3. Wählauftrag als Key "pf_dial" auf dem angemeldeten Benutzer speichern.
  4. Die Chrome-Erweiterung auf dem lokalen PC holt den Auftrag über den
     Vertec-Webservice (peoplefone_webservice.py) ab und wählt.

Beim ersten Aufruf wird ein persönlicher Kopplungscode erzeugt und angezeigt. Er
muss einmalig in den Einstellungen der Chrome-Erweiterung eingetragen werden.

Verwendete, in der Vertec Knowledge Base dokumentierte Funktionen:
  vtcapp.currentlogin, vtcapp.updatedatabase, vtcapp.SystemContext, vtcapp.msgbox, vtcapp.inputbox,
  setkeyvalue / getkeystring (Keys auf Benutzereinträgen), setmemberoutofdate,
  objid, OCL "kommMittel", Attribut "zieladresse", Variable "selectedobjects".
"""

import re
import time
import uuid

# ===================== Konfiguration =====================
LANDESVORWAHL = "41"   # für nationale Nummern: 031 ... -> +4131 ...
# =========================================================

KEY_AUFTRAG = "pf_dial"   # muss mit peoplefone_webservice.py übereinstimmen
KEY_CODE = "pf_code"      # muss mit peoplefone_webservice.py übereinstimmen


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


def baue_auftrag(nummer, jetzt=None, auftrag_id=None):
    """Format des Keys: "<id>|<unix-zeit>|<nummer>" (wird vom Webservice gelesen)."""
    if jetzt is None:
        jetzt = time.time()
    if auftrag_id is None:
        auftrag_id = uuid.uuid4().hex[:16]
    return "{0}|{1}|{2}".format(auftrag_id, int(jetzt), nummer)


def schreibe_key(benutzer, key, wert, vtcapp):
    """
    Schreibt einen Key auf den Benutzer und speichert.
    Zuerst mit den normalen Rechten des Benutzers; falls das nicht erlaubt ist, im
    SystemContext (dafür muss beim Script "Erweiterte Berechtigungen" aktiviert sein).
    Wichtig (Vertec KB): innerhalb des SystemContext keine Dialoge anzeigen.
    """
    try:
        benutzer.setkeyvalue(key, wert)
        vtcapp.updatedatabase()
        return
    except Exception:
        pass
    with vtcapp.SystemContext():
        benutzer.setkeyvalue(key, wert)
        vtcapp.updatedatabase()


def neuer_code():
    return uuid.uuid4().hex


def kopplungscode(benutzer):
    """Code, der in der Chrome-Erweiterung eingetragen wird: "<objid>-<geheimnis>"."""
    return "{0}-{1}".format(benutzer.objid, benutzer.getkeystring(KEY_CODE))


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


def stelle_kopplung_sicher(benutzer, vtcapp):
    """Erzeugt beim ersten Mal einen Kopplungscode und zeigt ihn an. True, wenn schon gekoppelt."""
    try:
        benutzer.setmemberoutofdate("keys")
    except Exception:
        pass
    if benutzer.getkeystring(KEY_CODE):
        return True
    schreibe_key(benutzer, KEY_CODE, neuer_code(), vtcapp)
    vtcapp.inputbox(
        "peoplefone einrichten",
        "Einmalige Einrichtung: Bitte diesen persönlichen Kopplungscode kopieren und in "
        "Chrome in den Einstellungen der Erweiterung 'Vertec -> peoplefone Wählhilfe' "
        "unter 'Kopplungscode' einfügen. Danach erneut 'Mit peoplefone anrufen' wählen.",
        kopplungscode(benutzer),
    )
    return False


def main(objekte):
    import vtcapp

    objekte = list(objekte or [])
    if len(objekte) != 1:
        vtcapp.msgbox("Bitte genau einen Eintrag auswählen.")
        return

    benutzer = vtcapp.currentlogin()
    if not stelle_kopplung_sicher(benutzer, vtcapp):
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

    schreibe_key(benutzer, KEY_AUFTRAG, baue_auftrag(nummer), vtcapp)


# Einstieg, wenn Vertec das Skript ausführt.
# "selectedobjects" ab Vertec 6.7.0.12, "argobject" bei älteren Versionen.
if "selectedobjects" in globals():
    main(globals()["selectedobjects"])
elif "argobject" in globals():
    main([globals()["argobject"]])
