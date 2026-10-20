# Kiel by Night · Review der Basis v1.0

Stand: 20.10.2026 · Gebaut und geprüft von Claude Code ohne Rückfragen, wie Roland es angewiesen hat. Offene Punkte stehen in Abschnitt 4.

## 1. Was getestet wurde (und was nicht)

| Prüfung | Ergebnis | Grenze |
|---|---|---|
| Alle 4 Migrationen auf Postgres 16 mit nachgebautem Supabase-Kern (auth.uid, storage, Rollen) | fehlerfrei | Der Nachbau ist nicht das echte Supabase. Der erste echte Lauf passiert bei dir (Setup, Schritt 6). |
| RLS-Tests `tests/rls_test.sql`: ST, 2 Spieler, anon und ein Konto ohne Profil, rund 55 Prüfungen | alle grün | Gegenprobe: Mit einer absichtlich geschwächten Policy schlägt der Test an. Die Tests greifen also. |
| Edge Function `notion-proxy` gegen Mock-Notion/Mock-Supabase (Deno 2.5), 14 Fälle | alle grün | Mit der echten Notion-API wurde nicht getestet, weil das Netz in der Bauumgebung gesperrt war. |
| `deno check` (Typprüfung) der Function | fehlerfrei | – |
| Browser-Smoke-Test (Chromium) über alle Bereiche als ST und Spieler, hell und dunkel, plus Login am Handy-Format | ohne JS-Fehler | Läuft gegen eine In-Memory-Attrappe statt Supabase und prüft keine Rechte. Die Rechte prüfen die RLS-Tests. |

## 2. Im Review gefundene und behobene Fehler

1. **Sicherheitslücke:** Ein per Selbstregistrierung angelegtes Konto hätte automatisch ein Spielerprofil bekommen und alles lesen können.
   - Behoben: Profile entstehen nicht mehr automatisch, und alle Policies verlangen `is_member()`.
   - Getestet: Ein fremdes Konto sieht 0 Zeilen und kann nichts schreiben.
2. **Sicherheitslücke:** Konten ohne Profil konnten Wiki-Kategorien anlegen. Behoben und getestet.
3. **Rechte:** Spieler hätten den Ersteller einer Wiki-Seite auf sich umschreiben und sie danach löschen können. Behoben, weil `created_by` jetzt unveränderlich ist. Getestet.
4. **Karte:**
   - Ein „null"-Text erschien über der Spielerkarte.
   - Bei wenigen Knoten wurde maximal hineingezoomt. Der Zoom ist jetzt auf 1,2 begrenzt.
5. **A7:** Der Messing-Ring der Spielercharaktere war vom Ghoul-Messing nicht zu unterscheiden. Er ist jetzt ein doppelter Ring in Tintenfarbe.
6. **Bogen:** Die Spezialisierungsfelder waren als volle Eingabefelder gestaltet. Das CSS-Selektor-Problem stammt bereits aus v1 und ist korrigiert.
7. **Login:** Ein doppelter Seitenaufbau war möglich, wenn das Auth-Ereignis während des Ladens kam. Ein Guard verhindert das jetzt.
8. **Notion-Link:** Er wird nur noch bei `https://` gesetzt, als Schutz gegen `javascript:`-URLs.

## 3. Bewusste Abweichungen von v1 und vom Vorschlag

| Punkt | Entscheidung (eigene Leistung, bitte prüfen) |
|---|---|
| Spieler legen keinen eigenen Bogen an | Die 3 Bögen werden per Seed angelegt. Du ordnest sie per SQL den Konten zu (Setup, Schritt 8). |
| Session-Notizen | Der **ST darf ebenfalls** einen eigenen Abschnitt schreiben. In v1 war das gesperrt. Grundlage ist „jede Person schreibt ihren eigenen Abschnitt". Es gibt keinen Extra-Bereich. |
| „Letzte Änderungen" | Statt einer eigenen Aktivitätstabelle liest die Übersicht direkt die letzten Wiki-Seiten, Dokumente und Notizen. RLS filtert automatisch, deshalb kann nichts durchsickern. |
| Spielerkarte: Löschen | Löschen mit „Wirklich?" bleibt wie in v1. A6 „verworfen" habe ich als „keine zusätzliche Löschfunktion" gelesen, **nicht** als „Löschen entfernen". |
| „Auf Spielerkarte" für Kanten | Kanten werden **ohne Beschriftung** und ohne Beschreibung übertragen, wie in v1. Die Beschriftung könnte ST-Wissen verraten. |
| A5 Formen (eigene Zuordnung) | Camarilla ⬡ Sechseck · Anarch △ Dreieck · Sabbat ◇ Raute · Unabhängig ▢ abgerundetes Rechteck · Second Inquisition ☆ Stern · ohne Sekte ○ Kreis. Eine Legende steht über der ST-Karte. |
| A7 Farben (eigene Zuordnung) | Kindred Blutrot · Ghoul Messing · Sterblicher Seeblau · Wight Pflaume · Geist Petrol · Werwolf Rost · Ort Moos · Organisation Schiefer · Gegenstand Oliv · Platzhalter Grau |
| A1 Zoom | Die Cytoscape-Standardgeschwindigkeit ist 4× schneller als v1 (0,25). Ist dir das zu schnell oder zu langsam, ist es eine Zeile in `web/js/views/map.js`. |
| Live-Aktualisierung | Nur die Spielerkarte aktualisiert sich live (Supabase Realtime). Andere Bereiche zeigen den Stand beim Öffnen, Positionsänderungen der anderen erst nach Neuladen. |
| Edge Function JWT | `verify_jwt = false`. Die Function prüft selbst per `getUser()` und `is_st()`. Das ist robuster bei den neuen Supabase-JWT-Schlüsseln. |

## 4. Offene Punkte und Risiken (nicht verifiziert)

1. **Menünamen im Supabase-Dashboard:** Sie stammen aus meinem Wissensstand. Die Links in der Setup-Anleitung konnte ich nicht abrufen, weil das Netz gesperrt war.
2. **Pause-Schutz:** Ob ein REST-Aufruf von `ping()` für Supabase als „Aktivität" zählt, ist **nicht belegt**. Bitte nach den ersten 1–2 Wochen im Dashboard prüfen, ob das Projekt aktiv bleibt.
3. **Notion Data-Source-API:** Sie ist implementiert nach Notion-Version `2025-09-03` (`POST /v1/data_sources/{id}/query`). Bei Fehler 400 oder 404 fällt sie automatisch auf die alte Database-Query zurück. Beide Wege sind nur gegen einen Mock getestet.
4. **Notion-Feldnamen** sind aus Übergabe Abschnitt 5 und v1 übernommen (`Von (NPC)`, `Nach (NPC)`, `Map-Tags` …). Weicht ein Name ab, bleibt das Feld leer, ohne Absturz.
5. **Env-Variablen der Function:** `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` werden laut meinem Stand automatisch bereitgestellt. Fehlen sie bei neuen Projekten, meldet die Function `config_missing`. Abhilfe steht in Setup-Schritt 14.
6. **Code liegt nur im Container:** GitHub ist in dieser Sitzung nicht verbunden, deshalb habe ich **nicht gepusht**. Das Archiv `kiel-by-night_v1_0.tar.gz` habe ich dir als Datei geschickt.
7. **Spielerkarte gleichzeitig bearbeiten:** Wenn zwei Personen denselben Knoten gleichzeitig ändern, gewinnt die letzte Speicherung.

## 5. Nächste Schritte

1. GitHub mit Claude verbinden oder das Archiv selbst pushen (Setup A.2).
2. Setup-Anleitung B bis G abarbeiten.
3. Rückmeldung zu Abschnitt 3: Welche Abweichungen passen nicht?

### Changelog
- **v1.0** (20.10.2026): Erstes Review der Basis.
