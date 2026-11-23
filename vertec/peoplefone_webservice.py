# -*- coding: utf-8 -*-
"""
Vertec-Webservice für die Chrome-Erweiterung "Vertec -> peoplefone Wählhilfe"
(ab Vertec 6.8.0.17, Modul vtcweb).

Einrichtung (siehe README):
  1. Script anlegen: Bezeichnung "PeoplefoneWebservice" (ohne Leer-/Sonderzeichen),
     Plattform Python 3, Skripttext = diese Datei. NICHT in Menüs anzeigen.
  2. Einstellungen > Erweiterungen > Webservices > Neu:
       Name (Subpath):            peoplefone
       Python Klassenreferenz:    PeoplefoneWebservice.PeoplefoneDial
       Aktiv:                     [x]
  3. Technischen Vertec-Benutzer mit API-Token verwenden (Recht "Webservices ausführen",
     Lesezugriff auf Benutzer). Dieses Token kommt in die Chrome-Erweiterung.

Endpunkte (Authentifizierung: Header "Authorization: Bearer <API-Token>"):
  GET /api/webservice/peoplefone/ping       Header X-Peoplefone-Code -> {"ok": true}
  GET /api/webservice/peoplefone/auftrag    Header X-Peoplefone-Code -> {"id": ..., "tel": ...}
                                                                     oder {"id": null}

Der Kopplungscode "<objid>-<geheimnis>" bestimmt, wessen Wählaufträge geliefert werden.
Ohne passenden Code gibt es keine Daten (403).
"""

import hmac
import time

import vtcapp
from vtcweb import WebService, get, WebException

KEY_AUFTRAG = "pf_dial"   # muss mit peoplefone_anrufen.py übereinstimmen
KEY_CODE = "pf_code"      # muss mit peoplefone_anrufen.py übereinstimmen
MAX_ALTER_SEKUNDEN = 30   # ältere Aufträge werden nicht mehr gewählt
CODE_HEADER = "x-peoplefone-code"


def parse_auftrag(wert, jetzt, max_alter=MAX_ALTER_SEKUNDEN):
    """'<id>|<unix-zeit>|<nummer>' -> {'id', 'tel', 'alter'} oder None (leer/zu alt/ungültig)."""
    if not wert:
        return None
    teile = str(wert).split("|")
    if len(teile) != 3:
        return None
    auftrag_id, zeit, tel = teile
    try:
        alter = int(jetzt) - int(zeit)
    except ValueError:
        return None
    if not auftrag_id or not tel or alter < -60 or alter > max_alter:
        return None
    return {"id": auftrag_id, "tel": tel, "alter": max(alter, 0)}


def zerlege_code(code):
    """'<objid>-<geheimnis>' -> (objid:int, geheimnis:str) oder (None, None)."""
    if not code or "-" not in code:
        return None, None
    objid, geheimnis = code.strip().split("-", 1)
    try:
        return int(objid), geheimnis
    except ValueError:
        return None, None


def header_wert(headers, name):
    for k, v in (headers or {}).items():
        if str(k).lower() == name:
            return v
    return None


class PeoplefoneDial(WebService):

    def _benutzer(self):
        objid, geheimnis = zerlege_code(header_wert(self.headers, CODE_HEADER))
        if objid is None or not geheimnis:
            raise WebException(403, "Kopplungscode fehlt oder ist ungültig")
        try:
            benutzer = vtcapp.getobjectbyid(objid)
        except Exception:
            raise WebException(403, "Kopplungscode ungültig")
        # Wert frisch aus der Datenbank lesen (er wurde in der Sitzung des Benutzers geschrieben).
        try:
            benutzer.setmemberoutofdate("keys")
        except Exception:
            pass
        gespeichert = benutzer.getkeystring(KEY_CODE) or ""
        if not gespeichert or not hmac.compare_digest(str(gespeichert), str(geheimnis)):
            raise WebException(403, "Kopplungscode ungültig")
        return benutzer

    @get("ping")
    def ping(self):
        self._benutzer()
        return self.as_json({"ok": True})

    @get("auftrag")
    def auftrag(self):
        benutzer = self._benutzer()
        auftrag = parse_auftrag(benutzer.getkeystring(KEY_AUFTRAG), time.time())
        return self.as_json(auftrag or {"id": None})
