# -*- coding: utf-8 -*-
"""Tests für vertec/peoplefone_anrufen.py ohne Vertec (vtcapp wird simuliert).

Ausführen mit:  python3 -m unittest discover -s tests
"""
import importlib.util
import json
import os
import sys
import types
import unittest

HIER = os.path.dirname(os.path.abspath(__file__))
SKRIPT = os.path.join(HIER, "..", "vertec", "peoplefone_anrufen.py")


def lade_skript():
    spec = importlib.util.spec_from_file_location("peoplefone_anrufen", SKRIPT)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)  # ohne selectedobjects -> main() läuft nicht
    return modul


S = lade_skript()


class FakeVtcapp(types.ModuleType):
    def __init__(self, antwort="1"):
        super().__init__("vtcapp")
        self.urls, self.files, self.meldungen, self.antwort = [], [], [], antwort

    def executeurl(self, url):
        self.urls.append(url)

    def executefile(self, cmd, args=""):
        self.files.append((cmd, args))

    def msgbox(self, text, *a):
        self.meldungen.append(text)
        return 1

    def inputbox(self, caption, prompt, default=""):
        self.prompt = prompt
        return self.antwort


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
                self.assertEqual(S.normalisiere_nummer(eingabe, "41"), erwartet, eingabe)

    def test_url(self):
        self.assertEqual(
            S.baue_url("+41311234567", "ab&c=d", "https://softphone.peoplefone.com/"),
            "https://softphone.peoplefone.com/#vertec-dial=%2B41311234567&k=ab%26c%3Dd",
        )

    def test_telefon_filter(self):
        self.assertTrue(S.sieht_wie_telefonnummer_aus("031 123 45 67"))
        self.assertFalse(S.sieht_wie_telefonnummer_aus("info@example.ch"))
        self.assertFalse(S.sieht_wie_telefonnummer_aus("https://www.example.ch"))
        self.assertFalse(S.sieht_wie_telefonnummer_aus("www.example.ch"))
        self.assertFalse(S.sieht_wie_telefonnummer_aus(None))


class TestMain(unittest.TestCase):
    def setUp(self):
        self.fake = FakeVtcapp()
        sys.modules["vtcapp"] = self.fake
        S.TOKEN = "geheim"
        S.CHROME_PFAD = ""

    def tearDown(self):
        sys.modules.pop("vtcapp", None)

    def test_kommunikationsmittel_direkt(self):
        S.main([KommMittel("031 123 45 67")])
        self.assertEqual(self.fake.urls, ["https://softphone.peoplefone.com/#vertec-dial=%2B41311234567&k=geheim"])

    def test_adresse_mit_mehreren_nummern(self):
        self.fake.antwort = "2"
        adr = Adresse([
            KommMittel("info@example.ch", "E-Mail"),
            KommMittel("031 123 45 67", "Telefon"),
            KommMittel("079 123 45 67", "Mobile"),
        ])
        S.main([adr])
        self.assertIn("1: 031 123 45 67 (Telefon)", self.fake.prompt)
        self.assertEqual(self.fake.urls, ["https://softphone.peoplefone.com/#vertec-dial=%2B41791234567&k=geheim"])

    def test_abbruch_bei_auswahl(self):
        self.fake.antwort = ""
        S.main([Adresse([KommMittel("031 1"), KommMittel("079 2")])])
        self.assertEqual(self.fake.urls, [])

    def test_keine_nummer(self):
        S.main([Adresse([KommMittel("info@example.ch")])])
        self.assertEqual(self.fake.urls, [])
        self.assertTrue(self.fake.meldungen)

    def test_token_fehlt(self):
        S.TOKEN = "HIER-DEN-TOKEN-AUS-DER-CHROME-ERWEITERUNG-EINTRAGEN"
        S.main([KommMittel("031 123 45 67")])
        self.assertEqual(self.fake.urls, [])
        self.assertIn("TOKEN", self.fake.meldungen[0])

    def test_chrome_pfad(self):
        S.CHROME_PFAD = r"C:\Chrome\chrome.exe"
        S.main([KommMittel("031 123 45 67")])
        self.assertEqual(self.fake.files[0][0], r"C:\Chrome\chrome.exe")
        self.assertTrue(self.fake.files[0][1].startswith('"https://softphone.peoplefone.com/#vertec-dial='))


if __name__ == "__main__":
    unittest.main()
