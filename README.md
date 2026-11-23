# Vertec → peoplefone Wählhilfe

In Vertec (läuft im **RDS-Desktop**) auf **„Mit peoplefone anrufen“** klicken → auf dem **lokalen PC** öffnet
Google Chrome das **peoplefone SOFTPHONE** (oder nimmt den bereits offenen Tab) und wählt die Nummer.

```
RDS-Desktop                         Vertec Cloud Server                      Lokaler PC (Chrome)
──────────────                      ───────────────────                      ───────────────────
Vertec: "Mit peoplefone anrufen"
  └─ speichert Wählauftrag ───────► Key "pf_dial" am Benutzer
                                    Webservice "peoplefone"  ◄── fragt alle 2 s ── Chrome-Erweiterung
                                      liefert Auftrag nur bei                      ├─ Softphone-Tab suchen
                                      gültigem Kopplungscode   ── Nummer ───────►  │  oder öffnen
                                                                                   └─ Nummer ans Softphone
```

Die Telefonnummern verlassen dabei **Ihre bestehende Vertec-Umgebung nicht** – es gibt keinen zusätzlichen
Server und keinen Drittanbieter (wichtig wegen Berufsgeheimnis, Art. 321 StGB, und DSG).

## Inhalt

| Datei | Zweck |
|---|---|
| `vertec/peoplefone_anrufen.py` | Menüeintrag „Mit peoplefone anrufen“ – legt den Wählauftrag ab |
| `vertec/peoplefone_kopplung.py` | Menüeintrag „peoplefone: Kopplungscode anzeigen“ (optional) |
| `vertec/peoplefone_webservice.py` | Vertec-Webservice, den die Chrome-Erweiterung abfragt |
| `chrome-extension/` | Chrome-Erweiterung für den lokalen PC |
| `tests/` | Unit-Tests (Python + JS) und End-to-End-Test |

## Voraussetzungen

- **Vertec ab 6.8.0.17** (eigene Webservices). Ihre Version 6.8.0.21 erfüllt das.
- Der lokale PC muss den Vertec Cloud Server über HTTPS erreichen (wie die Vertec-Apps auch).
- Google Chrome ab Version 116 auf dem lokalen PC, peoplefone SOFTPHONE-Konto.

## Grenzen – bitte lesen

1. **Übergabe an das Softphone:** Das Format `{type: 'CLICK_TO_CALL', tel: …}` stammt aus dem Quellcode der
   *offiziellen* „Peoplefone Softphone Extension“ (Chrome Web Store, Version 1.0.1.3). Es ist **keine öffentlich
   dokumentierte API**; peoplefone kann es ändern. Empfehlung: bei development@peoplefone.ch bestätigen lassen.
2. **Nicht gegen das echte Softphone und nicht in einem echten Vertec getestet.** Getestet sind die echten Skripte
   auf einem nachgebildeten Vertec und die echte Erweiterung in Chromium gegen ein nachgebildetes Softphone.
   Ein Pilot mit einem Arbeitsplatz ist vor dem Rollout nötig (Checkliste unten).
3. **Verzögerung:** Normalerweise 1–3 Sekunden. Laut Vertec-Doku läuft der Webservice in einer eigenen
   Sitzung; das Skript liest den Wert deshalb mit `setmemberoutofdate("keys")` frisch aus der Datenbank. Sollte
   das in Ihrer Umgebung nicht greifen, kann es bis zum Notif-Intervall (Standard 10 s) dauern → im Pilot prüfen.
4. **Nur der eigene Menüeintrag**, nicht der eingebaute Vertec-Befehl „Anrufen“: Letzterer übergibt die Nummer
   als `tel:`-Link an Windows im RDS-Desktop – dort läuft aber nicht Ihr Chrome.
5. **Fenster nach vorne holen:** Windows verhindert teilweise, dass sich ein Programm selbst in den Vordergrund
   drängt. Dann blinkt Chrome in der Taskleiste; der Anruf startet trotzdem.
6. **Last:** Jeder PC fragt Vertec alle 2 s ab (sehr kleine Anfragen). Bei vielen Benutzern das Intervall
   erhöhen oder mit Vertec/IT abklären.

## Einrichtung (einmalig, durch Vertec-Administrator / IT)

### 1. Technischen Vertec-Benutzer anlegen

Die Chrome-Erweiterung meldet sich nicht mit dem persönlichen Konto an, sondern mit einem technischen Benutzer
(z. B. „peoplefone-dienst“) mit **möglichst wenig Rechten**:
- Recht **Webservices ausführen** (laut Vertec standardmässig bei „Administratoren“ und „Standardbenutzer“).
- **Lesezugriff auf Benutzer** (der Webservice liest den Wählauftrag am jeweiligen Benutzer).
  *Welche Benutzergruppe/Rechte dafür genau nötig sind, bitte im Pilot prüfen.*
- Auf dessen Seite **Weitere Infos** ein **API-Token** erzeugen und sicher notieren (wird nur einmal angezeigt).

Warum nicht das persönliche API-Token? Ein persönliches Token hätte im Browser die vollen Vertec-Rechte der
Person. Das technische Token erlaubt nur, was der technische Benutzer darf; welche Aufträge geliefert werden,
bestimmt zusätzlich der persönliche Kopplungscode.

### 2. Webservice anlegen

1. **Einstellungen > Reports & Scripts > Scripts > Neu > Script**
   - Bezeichnung: `PeoplefoneWebservice` (ohne Leer-/Sonderzeichen, ist Teil der Klassenreferenz)
   - Plattform: Python 3, **nicht** in Menüs anzeigen
   - Skripttext: Inhalt von `vertec/peoplefone_webservice.py`
2. **Einstellungen > Erweiterungen > Webservices > Neu**
   - Name (Subpath): `peoplefone`
   - Python Klassenreferenz: `PeoplefoneWebservice.PeoplefoneDial`
   - Aktiv: ✔ (für die Einrichtung zusätzlich „Requests tracken“ ✔, danach wieder aus)

### 3. Menüeinträge anlegen

**Einstellungen > Reports & Scripts > Scripts > Neu > Script**, je einmal für:

| | „Mit peoplefone anrufen“ | „peoplefone: Kopplungscode anzeigen“ |
|---|---|---|
| Skripttext | `vertec/peoplefone_anrufen.py` | `vertec/peoplefone_kopplung.py` |
| In Vertec-Menüs anzeigen | ✔ | ✔ |
| Plattform | Python 3 | Python 3 |
| Klassen | Adressklassen (Personen, Firmen, Kontakte) und ggf. Kommunikationsmittel – *genaue Namen in der Auswahlliste / im Model Browser prüfen* | gleich |
| Anzeigebedingung | `self->size = 1` | `self->size = 1` |
| Erweiterte Berechtigungen | ✔ (siehe unten) | ✔ |

*Erweiterte Berechtigungen:* Die Skripte speichern einen Wert am **eigenen** Benutzereintrag. Dürfen Benutzer
das nicht, schreiben die Skripte – und nur diese eine Zeile – im `SystemContext`. Dialoge werden dabei gemäss
Vertec-Vorgabe nie im SystemContext angezeigt. Dürfen Ihre Benutzer ihren eigenen Eintrag ohnehin ändern,
kann die Option aus bleiben.

### 4. Chrome-Erweiterung verteilen (lokale PCs)

- Zum Testen: `chrome://extensions` → **Entwicklermodus** → **Entpackte Erweiterung laden** → Ordner
  `chrome-extension`.
- Produktiv: zentral durch die IT verteilen (Chrome-Richtlinie `ExtensionInstallForcelist`, mit selbst
  gehostetem Paket oder als nicht gelistete Erweiterung im Chrome Web Store).
- Empfohlen zusätzlich: offizielle [Peoplefone Softphone Extension](https://chromewebstore.google.com/detail/peoplefone-softphone-exte/egdokdcibedkodjiodgapdplgloblkim).

## Einrichtung pro Benutzer (ca. 1 Minute)

1. In Vertec auf einer Adresse **Mit peoplefone anrufen** wählen. Beim ersten Mal erscheint der persönliche
   **Kopplungscode** (Format `12345-…`) – kopieren.
2. In Chrome auf das Symbol der Erweiterung klicken → Einstellungen:
   - **Vertec-Adresse** (z. B. `https://firma.vertec-cloud.ch`), **API-Token** (technischer Benutzer, von der IT),
     **Kopplungscode** einfügen.
   - **Speichern und Verbindung testen** → Chrome fragt einmal nach dem Zugriff auf die Vertec-Adresse → erlauben.
3. Fertig. Ab jetzt wählt „Mit peoplefone anrufen“ direkt.

Das Erweiterungssymbol zeigt den Zustand: ohne Zeichen = verbunden, **?** = nicht eingerichtet,
**!** = Fehler (Mauszeiger auf das Symbol zeigt den Grund, z. B. „Kopplungscode ungültig“).

Neuer PC oder Code verloren: „peoplefone: Kopplungscode anzeigen“. Dort kann auch ein neuer Code erzeugt
werden (der alte wird dann ungültig).

## Pilot-Checkliste

1. Softphone geschlossen → „Mit peoplefone anrufen“ → Softphone öffnet sich auf dem lokalen PC und wählt?
2. Softphone offen → erneut → kein zweiter Tab, Anruf startet? Wie lange dauert es (Ziel: < 3 s)?
3. Chrome-Fenster minimiert / anderes Programm im Vordergrund → kommt Chrome nach vorne?
4. Abgemeldet → Login → wird nach dem Login gewählt (bis 3 Minuten)?
5. Benutzer ohne Admin-Rechte → funktionieren Kopplung und Anruf?
6. Falls nichts passiert: Symbol zeigt „!“? Im Webservice-Eintrag „Requests tracken“ aktivieren und Log
   ansehen; Wartezeit erhöhen; offizielle Peoplefone-Erweiterung zusätzlich installieren.

## Sicherheit und Datenschutz

- Daten bleiben in Vertec und auf dem lokalen PC; kein zusätzlicher Dienst.
- Am Benutzer gespeichert: Kopplungscode und **der zuletzt gewählte Auftrag** (ID, Zeit, Nummer). Aufträge
  älter als 30 Sekunden werden nicht mehr ausgeliefert.
- API-Token und Kopplungscode liegen in Chrome lokal (`chrome.storage.local`, nicht mit dem Google-Konto
  synchronisiert). Wer an einem entsperrten PC Zugriff auf Chrome hat, kann sie auslesen.
- Mehrwertnummern (0900/0901/0906) werden standardmässig nicht gewählt.

## Tests

```bash
python3 -m unittest discover -s tests        # Vertec-Skripte und Webservice (simuliertes vtcapp/vtcweb)
node --test tests/*.test.mjs                 # Nummern-Normalisierung, Vertec-Client (JS)
node tests/e2e_extension.cjs                 # Ende-zu-Ende in Chromium (Playwright, openssl, python3)
```

Der End-to-End-Test führt die echten Vertec-Skripte auf einem nachgebildeten Vertec aus und die echte
Erweiterung in Chromium gegen ein nachgebildetes Softphone: Verbindung ok; Softphone nicht offen → öffnet und
wählt; Softphone offen → gleicher Tab, keine Doppelwahl; 0900 → nicht gewählt; falscher Kopplungscode → Fehler
am Symbol, nicht gewählt.

## Quellen

- Vertec: [Custom web services](https://www.vertec.com/en-ch/kb/custom-webservices/),
  [Modul vtcweb](https://www.vertec.com/en-ch/kb/vertec-python-module-vtcweb/),
  [API-Token](https://www.vertec.com/en-ch/kb/api-token/),
  [Keys](https://www.vertec.com/en-ch/kb/key-values/),
  [Python-Funktionen](https://www.vertec.com/en-ch/kb/python-functions/),
  [Erweiterte Berechtigungen](https://www.vertec.com/de-ch/kb/erweiterte-berechtigungen/),
  [msgbox/inputbox](https://www.vertec.com/de-ch/kb/msgbox/),
  [Skripte registrieren](https://www.vertec.com/en-ch/kb/script-registration/),
  [Notif](https://www.vertec.com/en-ch/kb/notif/),
  [Kommunikationsmittel](https://www.vertec.com/en-ch/kb/kommmittel)
- peoplefone: [API-Dokumentation (Swagger)](https://api.peoplefone.com/services/api-doc/),
  [SOFTPHONE](https://support.peoplefone.com/en/peoplefone-softphone/),
  [Peoplefone Softphone Extension](https://chromewebstore.google.com/detail/peoplefone-softphone-exte/egdokdcibedkodjiodgapdplgloblkim)
