# Hinweise für Claude · Kiel by Night

Projektwissen steht in `docs/Technische_Doku.md` und `docs/Benutzerhandbuch.md`. Diese Datei hält nur Arbeitsregeln fest.

## Testsuiten laufen über einen günstigen Unteragenten

Regel des Betreibers (12.11.2026): Die Testsuiten startet nicht die Hauptsitzung, sondern ein günstiger Unteragent (Agent-Werkzeug mit `model: "haiku"`). Grund: Die Läufe dauern lange und erzeugen viel Ausgabe, die im teuren Hauptmodell nichts verloren hat.

- Der Unteragent führt nur aus und berichtet. Er ändert keine Dateien, committet nicht und behebt keine Fehler.
- Sein Bericht enthält je Suite: Gesamtzahl, grün, rot, und zu jedem roten Fall Kennung, Name und die Fehlermeldung im Wortlaut.
- Die Hauptsitzung wertet den Bericht aus und entscheidet, was zu tun ist.

Aufrufe (aus `tests/uat`, Abhängigkeiten einmalig mit `npm install`):

| Suite | Aufruf | Dauer |
|---|---|---|
| Browser | `node ui_uat.mjs` (optional mit Muster, z. B. `"^U(31\|39)$"`) | rund 13 Minuten |
| Rechte | `node run_rls.mjs` | unter 1 Minute |
| Edge Function | `node fn_uat.mjs` | unter 1 Minute |
| Würfelregeln | `node ../dice_test.mjs` | Sekunden |
| Smoke | `node smoke.mjs` in `tests/browser` | rund 2 Minuten |

In der Claude-Cloud-Umgebung ist Chromium vorinstalliert: `CHROME=/opt/pw-browsers/chromium` setzen und Playwright nicht neu installieren.
