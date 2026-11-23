# -*- coding: utf-8 -*-
"""Tests für die Vertec-Skripte (vtcapp/vtcweb simuliert, siehe tests/fakes).

Ausführen mit:  python3 -m unittest discover -s tests
"""
import importlib.util
import json
import os
import sys
import time
import unittest

HIER = os.path.dirname(os.path.abspath(__file__))
VERTEC = os.path.join(HIER, "..", "vertec")
sys.path.insert(0, os.path.join(HIER, "fakes"))

import fake_vertec  # noqa: E402
from fake_vertec import FakeUser, FakeVtcapp  # noqa: E402


def lade(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(VERTEC, name + ".py"))
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)  # ohne selectedobjects -> main() läuft nicht
    return modul


fake_vertec.installiere(FakeVtcapp())  # damit das Webservice-Skript importiert werden kann
ANRUFEN = lade("peoplefone_anrufen")
KOPPLUNG = lade("peoplefone_kopplung")
WEBSERVICE = lade("peoplefone_webservice")


class KommMittel(object):
    def __init__(self, ziel, bezeichnung=""):
        self.zieladresse = ziel
        self._bez = bezeichnung

    def evalocl(self, ausdruck):
        if ausdruck == "bezeichnung":
            return self._bez
        raise Exception("unbekannt")


class Adresse(object):
    def __init__(self, kommmittel):
        self._km = kommmittel

    def evalocl(self, ausdruck):
        if ausdruck == "kommMittel":
            return self._km
        raise Exception("unbekannt")


class TestNormalisierung(unittest.TestCase):
    def test_gemeinsame_testfaelle(self):
        with open(os.path.join(HIER, "vectors.json"), encoding="utf-8") as f:
            for eingabe, erwartet in json.load(f):
                if eingabe.startswith("tel:%2B"):
                    continue  # URL-Dekodierung macht nur die Chrome-Erweiterung
                self.assertEqual(ANRUFEN.normalisiere_nummer(eingabe, "41"), erwartet, eingabe)

    def test_telefon_filter(self):
        self.assertTrue(ANRUFEN.sieht_wie_telefonnummer_aus("031 123 45 67"))
        self.assertFalse(ANRUFEN.sieht_wie_telefonnummer_aus("info@example.ch"))
        self.assertFalse(ANRUFEN.sieht_wie_telefonnummer_aus("https://www.example.ch"))
        self.assertFalse(ANRUFEN.sieht_wie_telefonnummer_aus(None))

    def test_konstanten_gleich(self):
        for m in (KOPPLUNG, WEBSERVICE):
            self.assertEqual(m.KEY_CODE, ANRUFEN.KEY_CODE)
        self.assertEqual(WEBSERVICE.KEY_AUFTRAG, ANRUFEN.KEY_AUFTRAG)


class TestAnrufen(unittest.TestCase):
    def setUp(self):
        self.vtc = FakeVtcapp()
        fake_vertec.installiere(self.vtc)
        self.user = self.vtc.benutzer

    def gekoppelt(self):
        self.user.setkeyvalue(ANRUFEN.KEY_CODE, "geheim")

    def auftrag(self):
        return self.user.getkeystring(ANRUFEN.KEY_AUFTRAG)

    def test_erster_aufruf_zeigt_kopplungscode_und_waehlt_nicht(self):
        ANRUFEN.main([KommMittel("031 123 45 67")])
        code = self.user.getkeystring(ANRUFEN.KEY_CODE)
        self.assertEqual(len(code), 32)
        self.assertEqual(self.vtc.inputboxen[0][2], "4711-" + code)
        self.assertEqual(self.auftrag(), "")

    def test_auftrag_wird_gespeichert(self):
        self.gekoppelt()
        ANRUFEN.main([KommMittel("031 123 45 67")])
        auftrag_id, zeit, tel = self.auftrag().split("|")
        self.assertEqual(tel, "+41311234567")
        self.assertLessEqual(abs(int(zeit) - time.time()), 2)
        self.assertEqual(len(auftrag_id), 16)
        self.assertGreaterEqual(self.vtc.updates, 1)

    def test_jeder_klick_neue_id(self):
        self.gekoppelt()
        ANRUFEN.main([KommMittel("031 123 45 67")])
        a = self.auftrag()
        ANRUFEN.main([KommMittel("031 123 45 67")])
        self.assertNotEqual(a.split("|")[0], self.auftrag().split("|")[0])

    def test_ohne_schreibrecht_systemcontext_ohne_dialog(self):
        self.user.darf_schreiben = False
        ANRUFEN.main([KommMittel("031 123 45 67")])  # erzeugt Code im SystemContext
        ANRUFEN.main([KommMittel("031 123 45 67")])
        self.assertTrue(self.auftrag().endswith("|+41311234567"))
        self.assertFalse(self.vtc.dialog_im_systemcontext)

    def test_adresse_mit_mehreren_nummern(self):
        self.gekoppelt()
        self.vtc.antwort = "2"
        ANRUFEN.main([Adresse([
            KommMittel("info@example.ch", "E-Mail"),
            KommMittel("031 123 45 67", "Telefon"),
            KommMittel("079 123 45 67", "Mobile"),
        ])])
        self.assertIn("1: 031 123 45 67 (Telefon)", self.vtc.inputboxen[-1][1])
        self.assertTrue(self.auftrag().endswith("|+41791234567"))

    def test_abbruch_bei_auswahl(self):
        self.gekoppelt()
        self.vtc.antwort = ""
        ANRUFEN.main([Adresse([KommMittel("031 1111"), KommMittel("079 2222")])])
        self.assertEqual(self.auftrag(), "")

    def test_keine_nummer(self):
        self.gekoppelt()
        ANRUFEN.main([Adresse([KommMittel("info@example.ch")])])
        self.assertEqual(self.auftrag(), "")
        self.assertTrue(self.vtc.meldungen)


class TestKopplung(unittest.TestCase):
    def setUp(self):
        self.vtc = FakeVtcapp()
        fake_vertec.installiere(self.vtc)
        self.user = self.vtc.benutzer

    def test_erzeugt_code(self):
        KOPPLUNG.main()
        code = self.user.getkeystring("pf_code")
        self.assertEqual(self.vtc.inputboxen[-1][2], "4711-" + code)

    def test_neuer_code_auf_wunsch(self):
        self.user.setkeyvalue("pf_code", "alt")
        self.vtc.antwort = "ja"
        KOPPLUNG.main()
        self.assertNotEqual(self.user.getkeystring("pf_code"), "alt")

    def test_alter_code_bleibt(self):
        self.user.setkeyvalue("pf_code", "alt")
        self.vtc.antwort = "nein"
        KOPPLUNG.main()
        self.assertEqual(self.user.getkeystring("pf_code"), "alt")
        self.assertEqual(self.vtc.inputboxen[-1][2], "4711-alt")


class TestWebservice(unittest.TestCase):
    def setUp(self):
        self.vtc = FakeVtcapp()
        fake_vertec.installiere(self.vtc)
        WEBSERVICE.vtcapp = self.vtc
        self.user = self.vtc.benutzer
        self.user.setkeyvalue("pf_code", "geheim")

    def rufe(self, alias, code="4711-geheim"):
        headers = {"X-Peoplefone-Code": code} if code is not None else {}
        status, body = fake_vertec.rufe_webservice_auf(WEBSERVICE.PeoplefoneDial, "GET", alias, headers)
        return status, (json.loads(body) if body and status == 200 else body)

    def test_ping(self):
        self.assertEqual(self.rufe("ping"), (200, {"ok": True}))

    def test_falscher_oder_fehlender_code(self):
        self.assertEqual(self.rufe("auftrag", "4711-falsch")[0], 403)
        self.assertEqual(self.rufe("auftrag", "9999-geheim")[0], 403)
        self.assertEqual(self.rufe("auftrag", "unsinn")[0], 403)
        self.assertEqual(self.rufe("auftrag", None)[0], 403)

    def test_kein_auftrag(self):
        self.assertEqual(self.rufe("auftrag"), (200, {"id": None}))

    def test_auftrag_wird_geliefert_und_frisch_gelesen(self):
        self.user.setkeyvalue("pf_dial", "abc|{0}|+41311234567".format(int(time.time())))
        status, daten = self.rufe("auftrag")
        self.assertEqual(status, 200)
        self.assertEqual((daten["id"], daten["tel"]), ("abc", "+41311234567"))
        self.assertIn("keys", self.user.outofdate_aufrufe)

    def test_alter_auftrag_wird_ignoriert(self):
        self.user.setkeyvalue("pf_dial", "abc|{0}|+41311234567".format(int(time.time()) - 120))
        self.assertEqual(self.rufe("auftrag"), (200, {"id": None}))

    def test_header_gross_klein(self):
        status, _ = fake_vertec.rufe_webservice_auf(
            WEBSERVICE.PeoplefoneDial, "GET", "ping", {"x-peoplefone-code": "4711-geheim"})
        self.assertEqual(status, 200)

    def test_parse_auftrag(self):
        p = WEBSERVICE.parse_auftrag
        self.assertIsNone(p("", 100))
        self.assertIsNone(p("a|b|c", 100))
        self.assertIsNone(p("a|100", 100))
        self.assertEqual(p("a|100|+41", 110)["tel"], "+41")


if __name__ == "__main__":
    unittest.main()
