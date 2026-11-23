# Vertec → peoplefone Wählhilfe

Klick auf **Anrufen** in Vertec → Google Chrome öffnet das **peoplefone SOFTPHONE** (oder nimmt den bereits
offenen Tab) → die Nummer wird gewählt.

```
Vertec (Desktop-/Cloud-App im DaaS-Desktop)
   │  Weg A: eigener Menüeintrag "Mit peoplefone anrufen" (Vertec-Python-Skript, vtcapp.executeurl)
   │  Weg B: Standardbefehl "Anrufen" → tel:+41… → Windows-tel:-Handler (PowerShell)
   ▼
https://softphone.peoplefone.com/#vertec-dial=%2B41311234567&k=<Token>   (in Chrome)
   ▼
Chrome-Erweiterung "Vertec → peoplefone Wählhilfe"
   ├─ prüft Token, Nummer, Sperrliste (0900/0901/0906)
   ├─ Softphone schon offen?  ja → neuen Tab schliessen, Softphone-Tab nach vorne holen
   │                          nein → Softphone in diesem Tab laden (ggf. Login), kurz warten
   └─ übergibt die Nummer an das Softphone: postMessage({type:'CLICK_TO_CALL', tel:'+41…'})
```

## Inhalt

| Ordner | Zweck |
|---|---|
| `chrome-extension/` | Chrome-Erweiterung (Manifest V3), die den Wählauftrag ans Softphone übergibt |
| `vertec/peoplefone_anrufen.py` | Vertec-Skript als Menüeintrag „Mit peoplefone anrufen“ (die Zusatzfunktion in Vertec) |
| `windows/` | Optionaler `tel:`-Handler, damit auch der eingebaute Vertec-Befehl „Anrufen“ funktioniert |
| `tests/` | Unit-Tests (JS + Python) und ein End-to-End-Test der Erweiterung in Chromium |

## Wichtig vorab: Was die Lösung voraussetzt und wo die Grenzen sind

1. **Chrome muss im selben DaaS-Desktop laufen wie Vertec.** `vtcapp.executeurl` und `tel:`-Links öffnen sich
   auf dem Rechner, auf dem die Vertec-App läuft – bei DaaS also im virtuellen Desktop. Läuft das Softphone
   (wegen Headset/Audio) stattdessen im Chrome auf dem *lokalen* PC, kommt der Aufruf dort nicht an. Dann braucht
   es entweder eine URL-Weiterleitung der DaaS-Plattform (z. B. Citrix/AVD „URL redirection“) oder eine
   Server-Lösung (Relay). Bitte klären, wie es bei Ihnen eingerichtet ist.
2. **Die Übergabe an das Softphone beruht nicht auf einer öffentlich dokumentierten Peoplefone-API.**
   Das Format `{type: 'CLICK_TO_CALL', tel: …}` stammt aus dem Quellcode der *offiziellen*
   „Peoplefone Softphone Extension“ (Chrome Web Store, Version 1.0.1.3), die damit Click-to-Call umsetzt.
   Peoplefone kann das jederzeit ändern. Empfehlung: bei peoplefone (development@peoplefone.ch) bestätigen
   lassen, dass diese Schnittstelle genutzt werden darf und stabil bleibt.
3. **Gegen das echte Softphone ist die Lösung noch nicht getestet** (dazu fehlt hier ein peoplefone-Konto).
   Getestet ist die Erweiterung in Chromium gegen ein simuliertes Softphone (siehe „Tests“). Es ist möglich,
   dass das Softphone Click-to-Call nur annimmt, wenn zusätzlich die offizielle Peoplefone-Erweiterung
   installiert ist → im Pilot zuerst mit, dann ohne testen.
4. **Warum nicht die Peoplefone-REST-API?** Geprüft in der offiziellen Swagger-Dokumentation
   (`https://api.peoplefone.com/services/api-doc/`):
   - *Call Management API v1* kann laufende Anrufe auflisten, halten, weiterleiten – **aber keinen Anruf starten**.
   - *Remote Call Control uaCSTA* (Beta) kann mit `POST /device/call` einen Anruf starten – **aber nur auf
     Tischtelefonen mit uaCSTA-Unterstützung**, nicht im Browser-Softphone.
   Für Ihr Ziel (Softphone in Chrome) passt die REST-API deshalb nicht. Falls Sie (auch) Tischtelefone nutzen,
   wäre uaCSTA eine Alternative ohne Browser.
5. **Vertec:** Eine dokumentierte Schnittstelle, um eine *eigene* Telefonie-Erweiterung für den Standardbefehl
   „Anrufen“ zu schreiben, habe ich nicht gefunden. Die Lösung nutzt deshalb zwei dokumentierte Wege:
   registrierte Python-Skripte (Menü/Kontextmenü) und das Wählen via `tel:`-URI.

## Installation

### 1. Chrome-Erweiterung installieren (im DaaS-Desktop)

Zum Testen:
1. In Chrome `chrome://extensions` öffnen, oben rechts **Entwicklermodus** einschalten.
2. **Entpackte Erweiterung laden** → Ordner `chrome-extension` wählen.
3. Die Einstellungsseite öffnet sich: **Neu erzeugen** klicken (Token), **Speichern**. Token notieren.

Für den produktiven Einsatz auf allen DaaS-Desktops sollte die IT die Erweiterung zentral verteilen
(Chrome-Richtlinie `ExtensionInstallForcelist`, mit selbst gehostetem CRX-Paket oder als nicht gelistete
Erweiterung im Chrome Web Store). Im Entwicklermodus geladene Erweiterungen sind dafür nicht gedacht.

Zusätzlich empfohlen: die offizielle [Peoplefone Softphone Extension](https://chromewebstore.google.com/detail/peoplefone-softphone-exte/egdokdcibedkodjiodgapdplgloblkim)
(zeigt u. a. Anruf-Benachrichtigungen; siehe Punkt 3 der Grenzen).

### 2a. Zusatzfunktion in Vertec: Menüeintrag „Mit peoplefone anrufen“ (empfohlen)

Benötigt Administratorrechte in Vertec.

1. **Einstellungen > Reports & Scripts**, Rechtsklick auf **Scripts > Neu > Script**.
2. Felder ausfüllen:
   - **Bezeichnung:** `Mit peoplefone anrufen`
   - **In Vertec-Menüs anzeigen:** ✔
   - **Plattform:** Python 3
   - **Klassen:** die Klassen, auf denen der Eintrag erscheinen soll – die Adressklassen (Personen, Firmen,
     Kontakte) und, falls in der Auswahlliste vorhanden, die Klasse der Kommunikationsmittel.
     *Die genauen Klassennamen bitte in der Auswahlliste bzw. im Vertec Model Browser prüfen.*
   - **Anzeigebedingung:** `self->size = 1`
   - **Skripttext:** Inhalt von `vertec/peoplefone_anrufen.py` einfügen.
3. Oben im Skripttext den Konfigurationsblock anpassen:
   - `TOKEN` = Token aus Schritt 1
   - `CHROME_PFAD` leer lassen, wenn Chrome der Standardbrowser im DaaS-Desktop ist; sonst den Pfad zu
     `chrome.exe` eintragen (Vertec fragt dann beim ersten Mal, ob die Datei ausgeführt werden darf).
4. Speichern. Danach erscheint auf einer Adresse unter **Aktionen** bzw. per Rechtsklick
   **Mit peoplefone anrufen**. Hat die Adresse mehrere Nummern, fragt das Skript, welche gewählt werden soll.

Hinweis: Das Token steht im Skripttext und ist für Vertec-Administratoren sichtbar. Es schützt davor,
dass *fremde Webseiten* Anrufe auslösen – nicht vor Personen mit Zugriff auf Vertec.

### 2b. Optional: eingebauten Vertec-Befehl „Anrufen“ umleiten (Windows-tel:-Handler)

Vertec übergibt bei **Rechtsklick auf Nummer > Anrufen** die Nummer als `tel:+41…` an Windows
(Systemeinstellung **Telefonie > Wählen via URI unterstützen**, Standard: Ja). Diesen Link kann man auf
die Chrome-Erweiterung umleiten:

1. Ordner `windows` an einen festen Ort im DaaS-Profil kopieren, z. B. `%LOCALAPPDATA%\VertecPeoplefone`.
2. `config.example.json` → `config.json` kopieren und `Token` eintragen (gleicher Token wie in Schritt 1).
3. PowerShell im Ordner öffnen: `powershell -ExecutionPolicy Bypass -File .\Install-TelHandler.ps1`
4. In den Windows-Einstellungen **Standard-Apps** für den Linktyp **TEL** die App **Vertec → peoplefone**
   wählen (Windows lässt Programme diese Wahl nicht selbst treffen).

Einschränkungen: Beim Wählen blitzt kurz ein PowerShell-Fenster auf. In verwalteten DaaS-Umgebungen
können Gruppenrichtlinien die Wahl der Standard-App oder PowerShell-Skripte sperren – dann die IT
einbeziehen oder nur Weg 2a verwenden. Entfernen: `Uninstall-TelHandler.ps1`.

## Einstellungen der Chrome-Erweiterung

| Einstellung | Standard | Bedeutung |
|---|---|---|
| Token | – | Muss mit Vertec-Skript / `config.json` übereinstimmen; ohne gültigen Token wird nie gewählt |
| Landesvorwahl | `41` | Für nationale Nummern (`031…` → `+4131…`) |
| Wartezeit | `4000` ms | Pause nach dem Öffnen des Softphones, bis es angemeldet ist |
| Vor dem Wählen nachfragen | aus | Bestätigungsdialog im Softphone-Tab |
| Gesperrte Präfixe | `+41900`, `+41901`, `+41906` | Mehrwertnummern werden nicht gewählt |

## Tests

```bash
node --test tests/*.test.mjs                 # Nummern-Normalisierung, URL-Format (JS)
python3 -m unittest discover -s tests        # Vertec-Skript mit simuliertem vtcapp
node tests/e2e_extension.cjs                 # Erweiterung in Chromium gegen simuliertes Softphone (Playwright)
```

Der End-to-End-Test prüft: Softphone nicht offen → Tab öffnet und wählt (Token verschwindet aus der URL);
Softphone offen → zusätzlicher Tab wird geschlossen und der bestehende Tab wählt; falscher Token und
0900-Nummer → kein Anruf.

**Pilot-Test mit dem echten Softphone (bitte vor dem Rollout):**
1. Softphone in Chrome geschlossen → in Vertec „Mit peoplefone anrufen“ → Softphone öffnet sich, wählt?
2. Softphone offen → erneut → kein zweiter Tab, Anruf startet?
3. Abgemeldet → Login → wird nach dem Login gewählt (innerhalb von 3 Minuten)?
4. Falls nichts passiert: Wartezeit erhöhen; offizielle Peoplefone-Erweiterung zusätzlich installieren.

## Datenschutz / Sicherheit

- Die Nummer wird im URL-*Fragment* (`#…`) übergeben; Fragmente werden von Browsern nicht an Server
  gesendet. Die Erweiterung entfernt Nummer und Token sofort aus der Adresszeile; im Chrome-Verlauf kann der
  ursprüngliche Aufruf aber erscheinen.
- An peoplefone gelangt die Nummer erst beim Wählen – wie bei jedem Anruf über das Softphone.
- Die Erweiterung hat nur Zugriff auf die peoplefone-Softphone-Domains und braucht keine weiteren Server.

## Quellen

- Vertec: [Telefonie-Anbindung](https://www.vertec.com/en-ch/kb/telefonieanbindung/),
  [Systemeinstellungen Telefonie](https://www.vertec.com/en-ch/kb/sektiontelefonie/),
  [Python-Funktionen (executeurl, executefile, msgbox, inputbox)](https://www.vertec.com/en-ch/kb/python-functions/),
  [Skripte registrieren](https://www.vertec.com/en-ch/kb/script-registration/),
  [Kommunikationsmittel](https://www.vertec.com/en-ch/kb/kommmittel),
  [TAPI (nur On-Premises/Desktop-App)](https://www.vertec.com/en-ch/kb/tapi-extension/)
- peoplefone: [API-Dokumentation (Swagger)](https://api.peoplefone.com/services/api-doc/),
  [SOFTPHONE (Web-App in Chrome)](https://support.peoplefone.com/en/peoplefone-softphone/),
  [Peoplefone Softphone Extension](https://chromewebstore.google.com/detail/peoplefone-softphone-exte/egdokdcibedkodjiodgapdplgloblkim)
