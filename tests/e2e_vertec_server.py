# -*- coding: utf-8 -*-
"""
Test-Server für den End-to-End-Test (tests/e2e_extension.cjs).

Führt die echten Skripte vertec/peoplefone_webservice.py und vertec/peoplefone_anrufen.py
auf einem simulierten Vertec (tests/fakes/fake_vertec.py) aus:
  GET  /api/webservice/peoplefone/<alias>   wie der Vertec Cloud Server (Bearer-Token nötig)
  POST /test/anrufen?nummer=...             simuliert "Mit peoplefone anrufen" in Vertec
Gibt beim Start "PORT <nummer>" aus.
"""
import importlib.util
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HIER, "fakes"))
import fake_vertec  # noqa: E402
from fake_vertec import FakeVtcapp  # noqa: E402

TECH_TOKEN = "TECHTOKEN"
VTC = FakeVtcapp()
VTC.benutzer.setkeyvalue("pf_code", "geheim")  # Benutzer 4711 ist bereits gekoppelt
fake_vertec.installiere(VTC)


def lade(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HIER, "..", "vertec", name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


WEBSERVICE = lade("peoplefone_webservice")
ANRUFEN = lade("peoplefone_anrufen")


class KommMittel(object):
    def __init__(self, ziel):
        self.zieladresse = ziel


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _antwort(self, status, body="", ctype="application/json"):
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, X-Peoplefone-Code, Accept")
        self.send_header("Access-Control-Allow-Methods", "GET, POST")
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        prefix = "/api/webservice/peoplefone/"
        if not url.path.startswith(prefix):
            return self._antwort(404)
        if self.headers.get("Authorization") != "Bearer " + TECH_TOKEN:
            return self._antwort(401)
        headers = {k: v for k, v in self.headers.items() if k.lower() != "authorization"}
        status, body = fake_vertec.rufe_webservice_auf(
            WEBSERVICE.PeoplefoneDial, "GET", url.path[len(prefix):], headers)
        self._antwort(status, body or "")

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/test/anrufen":
            return self._antwort(404)
        nummer = parse_qs(url.query).get("nummer", [""])[0]
        ANRUFEN.main([KommMittel(nummer)])
        self._antwort(200, VTC.benutzer.getkeystring("pf_dial"), "text/plain")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    print("PORT", server.server_address[1], flush=True)
    server.serve_forever()
