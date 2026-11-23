# -*- coding: utf-8 -*-
"""
Vertec-Skript "peoplefone: Kopplungscode anzeigen"  (Menüeintrag, optional)

Zeigt den persönlichen Kopplungscode erneut an (z.B. für einen neuen PC) und
bietet an, einen neuen Code zu erzeugen (der alte wird damit ungültig).
Registrierung wie "Mit peoplefone anrufen" (gleiche Klassen und Einstellungen).
"""

import uuid

KEY_CODE = "pf_code"  # muss mit peoplefone_anrufen.py / peoplefone_webservice.py übereinstimmen


def _schreibe(benutzer, wert, vtcapp):
    """Wie schreibe_key() in peoplefone_anrufen.py (keine Dialoge im SystemContext)."""
    try:
        benutzer.setkeyvalue(KEY_CODE, wert)
        vtcapp.updatedatabase()
        return
    except Exception:
        pass
    with vtcapp.SystemContext():
        benutzer.setkeyvalue(KEY_CODE, wert)
        vtcapp.updatedatabase()


def main():
    import vtcapp

    benutzer = vtcapp.currentlogin()
    try:
        benutzer.setmemberoutofdate("keys")
    except Exception:
        pass

    if benutzer.getkeystring(KEY_CODE):
        # msgbox-Buttons 4 = Ja/Nein, Rückgabe 6 = Ja (Windows-Konvention, siehe Vertec KB
        # "msgbox/inputbox: Beschreibung der Parameter")
        if vtcapp.msgbox("Neuen Kopplungscode erzeugen? Der bisherige Code wird dann ungültig "
                         "und muss auf allen PCs ersetzt werden.\n\n"
                         "Nein = bisherigen Code anzeigen", 4, "peoplefone") == 6:
            _schreibe(benutzer, uuid.uuid4().hex, vtcapp)
    else:
        _schreibe(benutzer, uuid.uuid4().hex, vtcapp)

    vtcapp.inputbox(
        "peoplefone: Kopplungscode",
        "Diesen Code in Chrome in den Einstellungen der Erweiterung "
        "'Vertec -> peoplefone Wählhilfe' unter 'Kopplungscode' einfügen:",
        "{0}-{1}".format(benutzer.objid, benutzer.getkeystring(KEY_CODE)),
    )


if "selectedobjects" in globals() or "argobject" in globals():
    main()
