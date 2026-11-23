# -*- coding: utf-8 -*-
"""
Minimale Nachbildung der Vertec-Module "vtcapp" und "vtcweb" für Tests.
Bildet nur das Verhalten nach, das die peoplefone-Skripte nutzen (gemäss Vertec KB).
"""
import json
import sys
import types


class FakeUser(object):
    def __init__(self, objid, darf_schreiben=True):
        self.objid = objid
        self._keys = {}
        self.darf_schreiben = darf_schreiben
        self.outofdate_aufrufe = []

    # Keys (Vertec KB "Keys auf Benutzereinträgen")
    def setkeyvalue(self, key, value):
        if not self.darf_schreiben and not FakeVtcapp.system_context:
            raise PermissionError("Keine Schreibrechte")
        if value is None or value == "":
            self._keys.pop(key, None)
        else:
            self._keys[key] = str(value)

    def getkeystring(self, key):
        return self._keys.get(key, "")

    def setmemberoutofdate(self, name):
        self.outofdate_aufrufe.append(name)


class _SystemContext(object):
    def __enter__(self):
        FakeVtcapp.system_context = True

    def __exit__(self, *a):
        FakeVtcapp.system_context = False


class FakeVtcapp(types.ModuleType):
    system_context = False

    def __init__(self, benutzer=None, antwort="1"):
        super().__init__("vtcapp")
        self.benutzer = benutzer or FakeUser(4711)
        self.objekte = {self.benutzer.objid: self.benutzer}
        self.antwort = antwort
        self.meldungen, self.inputboxen, self.updates = [], [], 0
        self.dialog_im_systemcontext = False

    def currentlogin(self):
        return self.benutzer

    def getobjectbyid(self, objid):
        if int(objid) not in self.objekte:
            raise Exception("Objekt nicht gefunden")
        return self.objekte[int(objid)]

    def updatedatabase(self):
        self.updates += 1

    def SystemContext(self):
        return _SystemContext()

    def msgbox(self, text, buttons=0, title=""):
        self.dialog_im_systemcontext |= FakeVtcapp.system_context
        self.meldungen.append(text)
        return 6 if self.antwort == "ja" else 7 if self.antwort == "nein" else 1

    def inputbox(self, title, text, default=""):
        self.dialog_im_systemcontext |= FakeVtcapp.system_context
        self.inputboxen.append((title, text, default))
        return default if self.antwort in ("ja", "nein") else self.antwort


class WebException(Exception):
    def __init__(self, status, body=None, contenttype=None):
        super().__init__(body)
        self.status, self.body = status, body


class _Response(object):
    def __init__(self, status_code=200, body="", headers=None):
        self.status_code, self.body, self.headers = status_code, body, headers or {}


class WebService(object):
    def __init__(self, http_method="GET", headers=None, query=None):
        self.http_method = http_method
        self.headers = headers or {}
        self.query = query or {}
        self.response = _Response()

    def as_json(self, content):
        return _Response(200, json.dumps(content), {"Content-Type": "application/json"})


def _decorator(methode):
    def factory(alias):
        def deco(fn):
            fn._route = (methode, alias)
            return fn
        return deco
    return factory


def installiere(vtcapp):
    """Registriert die Fake-Module unter den Namen 'vtcapp' und 'vtcweb'."""
    vtcweb = types.ModuleType("vtcweb")
    vtcweb.WebService = WebService
    vtcweb.WebException = WebException
    vtcweb.get, vtcweb.post, vtcweb.put, vtcweb.delete, vtcweb.http = (
        _decorator("GET"), _decorator("POST"), _decorator("PUT"), _decorator("DELETE"), _decorator("HTTP"))
    sys.modules["vtcapp"] = vtcapp
    sys.modules["vtcweb"] = vtcweb
    return vtcweb


def rufe_webservice_auf(klasse, methode, alias, headers):
    """Simuliert den Vertec-Router: liefert (status, body)."""
    for name in dir(klasse):
        fn = getattr(klasse, name)
        route = getattr(fn, "_route", None)
        if route and route[1] == alias and route[0] in (methode, "HTTP"):
            dienst = klasse(methode, headers)
            try:
                res = fn(dienst)
            except WebException as e:
                return e.status, e.body or ""
            if isinstance(res, int):
                return res, ""
            if isinstance(res, str):
                return 200, res
            res = res or dienst.response
            return res.status_code, res.body
    return 404, ""
