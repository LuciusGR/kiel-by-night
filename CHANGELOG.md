# Changelog · Kiel by Night Website

Versionierung: `MAJOR.MINOR.PATCH`. MAJOR steht für Architekturwechsel, MINOR für neue Funktionen oder Schemaänderungen, PATCH für Korrekturen.
Dokumente in `docs/` und Migrationen tragen ihre Version im Dateinamen (`_vX_Y`) und werden nie überschrieben. Ausnahme: `Technische_Doku.md` und `Benutzerhandbuch.md` sind lebende Dokumente (Version im Kopf, Änderungsliste am Ende) und werden bei jeder Änderung an Funktionen, Rechten, Datenbank oder Betrieb mitgepflegt. Änderungen am Schema kommen immer als **neue** Migration.

## 1.9.2 – 23.10.2026
- **Spielerkarte: Sekte und Form:** Knoten der Spielerkarte haben das Feld „Sekte“ als Auswahl (Camarilla, Anarch, Sabbat, Unabhängig, Second Inquisition, „— keine —“). Die Form des Knotens folgt der Sekte wie auf der Storytellerkarte (Hexagon, Dreieck, Raute, Rechteck, Stern, sonst Kreis). Beim Ändern der Auswahl im Formular wechselt die Form sofort (Vorschau, „Abbrechen“ stellt sie zurück). Die Formen-Legende steht jetzt auch über der Spielerkarte, die Sekte in der Infokarte und im Excel-/CSV-Export (Spalte „Sekte“).
- **Datenbank:** Neue Migration `20261023120000_player_map_sect_v1_9.sql` (`player_map_nodes.sect`, erlaubte Werte per CHECK, Standard leer). Rechte und Policies unverändert. **Die Migration muss vor dem Einspielen der neuen Seite angewendet sein**, sonst scheitert das Speichern von Knoten.
- „Auf Spielerkarte“ von der Storytellerkarte überträgt die Sekte nicht (wie schon den Typ: ST-Wissen).

## 1.9.1 – 23.10.2026
- **Karten:** Auf der Spielerkarte und der Storytellerkarte (gemeinsamer Code `MapView`) steht die Beschriftung einer Verbindung jetzt dauerhaft auf der Linie, sobald man weit genug hineinzoomt (Cytoscape `min-zoomed-font-size`). Bisher erschien sie nur bei markierten Verbindungen.
- **Infokarte:** Bei jedem Knoten zeigt die Liste „Verbindungen“ neben der Beschriftung jetzt auch die Details (Beschreibung) der Verbindung, auf beiden Karten.
- Hinweis: Verbindungen, die der ST per „Auf Spielerkarte“ von der Storytellerkarte überträgt, kommen weiterhin ohne Beschriftung und Beschreibung an (Entscheidung aus der Übergabe, Notion-Texte können ST-Geheimnisse enthalten).

## 1.9.0 – 22.10.2026
- **Szenen gehören zu einer Chronik:** Jede Szenenkarte kann einer Chronik zugeordnet werden (auch im Vorrat ohne Session). Im Szenen-Editor gibt es die Auswahl „Chronik“, auf den Karten steht die Chronik als Schild, im Tab Szenen filtert eine Auswahl nach Chronik („Alle Chroniken“, „Ohne Chronik“, je Chronik). Neue Szenen in einer Session übernehmen deren Chronik, im Tab Szenen den gewählten Filter.
- **Import:** Das Feld `chronik` der Szenendatei (Szenenformat 1.2) ordnet die Szenen zu. In der Vorschau wählst du die Chronik für alle importierten Szenen, sie ist mit dem Titel aus der Datei vorbelegt. Gleiche Titel zählen je Chronik, dieselbe Szene darf also in zwei Chroniken vorkommen.
- **Automatischer Import:** Neue Edge Function `scene-import` und Skript `tools/import-scenes.mjs`. Claude baut aus einer Chronik-Datei (Markdown) Szenen und schreibt sie direkt in die Seite, ohne Hochladen. Die Function legt nur neue Szenen an (ändert und löscht nichts), ist mit dem Secret `IMPORT_TOKEN` gesichert und ohne dieses Secret abgeschaltet. Trockenlauf mit `?dry_run=1`. Das Hochladen in der Seite bleibt unverändert möglich.
- **Karten herunterladen:** Auf der Spielerkarte und der Storytellerkarte gibt es „Herunterladen“: Excel (zwei Blätter Knoten und Verbindungen), Knoten als CSV oder Verbindungen als CSV. Verbindungen enthalten die Namen statt nur IDs. Damit lässt sich die Karte auswerten, zum Beispiel durch Claude. Neues Modul `web/js/export.js` (ohne Bibliothek), Test `node tests/export_test.mjs`.
- **Datenbank:** Neue Migration `20261022120500_scenes_chronicle_v1_8.sql` (`scenes.chronicle_id`, bei gelöschter Chronik bleibt die Szene). Neue Migration `20261022120600_scene_import_grants_v1_9.sql`: `service_role` bekommt für `scene-import` genau die nötigen Rechte (lesen: Chroniken, Session-Infos, Szenen; anlegen: Szenen, NPC-Zeilen; löschen: nur Szenen). Policies unverändert.
- **Tests:** `node tests/scene_import_test.mjs` (21 Fälle, Function mit Datenbank im Speicher). Die Migration läuft im lokalen Postgres-Test fehlerfrei. Der alte Test `tests/rls_test.sql` schlägt in Zeile 92 schon auf `main` fehl (Regel seit 1.1 überholt), unabhängig von dieser Änderung.

## 1.8.0 – 22.10.2026
- **Dokumente und Karten verknüpfen:** Dokumente lassen sich mit Elementen der Spielerkarte und der Storytellerkarte verknüpfen. Der Link gilt in beide Richtungen. Im Detailfeld eines Knotens stehen die verknüpften Dokumente (Klick springt zum Dokument). In der Dokumenten-Liste stehen an jedem Dokument die verknüpften Knoten (Klick springt zum Knoten, „×“ löst die Verknüpfung). Verknüpfen und Lösen geht auf der Spielerkarte nur im Modus Bearbeitung. Verknüpfungen mit Elementen der Storytellerkarte sieht nur der Storyteller.
- **Rechte:** Neue Migration `20261022120400_document_links_v1_7.sql` mit Tabelle `document_links` (nur SELECT, INSERT, DELETE für `authenticated`, `anon` ohne Rechte), drei Policies (jetzt 67). Löscht man einen Spielerkarten-Knoten, entfernt ein Trigger dessen Verknüpfungen. Löscht man ein Dokument, verschwinden seine Verknüpfungen (Cascade).
- **Spielerkarte:** Der Typ eines Knotens ist eine Auswahl (Kindred, Ghoul, Sterblicher, Ort, Organisation, vorhandene Typen, „— ohne Typ —“, „＋ Neuer Typ …“). Das stammt aus Pull Request 1.
- **Tests:** Rechte 259 Fälle (R300 bis R327), Browser 163 Fälle (U112b, U230 bis U232).

## 1.7.0 – 22.10.2026
- **Dokumente:** Titel und Beschreibung lassen sich nach dem Hochladen ändern („Bearbeiten“ auf der Karte). Das darf der Uploader bei eigenen, veröffentlichten Dokumenten und der Storyteller bei allen. Die Datei selbst bleibt unverändert.
- **Rechte:** Neue Migration `20261022120300_documents_edit_v1_6.sql`. UPDATE auf `documents` ist per Spalten-GRANT auf `title`, `description` und `draft` beschränkt (Speicherpfad, Uploader, Dateiname und Größe bleiben gesperrt). Neue Policy `documents_update_own`. Spieler können eigene Dokumente nicht zum Entwurf machen.
- **Tests:** Rechte 237 Fälle, Browser 159 Fälle (U109).

## 1.6.1 – 22.10.2026
- **Kontrast:** Im Dunkelmodus ist der Rotton für Text (`--blood`) heller (`#df7482` statt `#d76675`). Rote Badges („Nur Storyteller“, „versteckt“) erreichen 5,2:1 statt 4,48:1 und erfüllen damit WCAG AA. Der Test U155b ist grün.

## 1.6.0 – 22.10.2026
- **Szenen-Vorrat:** Neuer Tab „Szenen“ (nur Storyteller). Szenenkarten lassen sich sammeln, ohne sie vorab einer Session zuzuordnen. Ansichten Vorrat, Zugeordnet, Alle, dazu eine Suche über Titel, Ort, Stimmung, Ziel, Gegenspieler, Ablauf, Fäden und NPC-Namen.
- **Zuordnen und Verschieben:** Eine Szene aus dem Vorrat ordnest du einer Session zu (auch „Session N (neu)“), verschiebst sie in eine andere oder legst sie in den Vorrat zurück.
- **Import:** `session` im Szenenformat ist optional (Szenenformat 1.1). Im Tab Szenen landet jeder Import im Vorrat, in einer Session-Ansicht in dieser Session.
- **Beziehungskarte:** „Kommt vor in“ zeigt auch Szenen aus dem Vorrat.
- **Datenbank:** Migration `20261022120200_scenes_pool_v1_5.sql` (`scenes.session_number` darf null sein).
- **Tests:** Rechte 230 Fälle (R231, R268 bis R272), Browser 158 Fälle (U220 bis U225).

## 1.5.3 – 22.10.2026
- **Fehler behoben:** In den Szenenkarten und in der Chroniken-Verwaltung erschien an leeren Stellen der Text „null“ (zum Beispiel „nullnull“ unter den Knöpfen). Leere Bausteine werden jetzt überall übersprungen (`lib.js`).
- **Handy:** Die Status-Knöpfe der Szenenkarten (Offen, Gespielt, Übersprungen, Verschoben) sind am Handy ein 2×2-Raster statt abgeschnitten. Verschachtelte Rahmen in aufgeklappten Sessions sind flacher, Innenabstände am Handy kleiner, mehr Platz für den Inhalt.
- **Tests:** U217 (kein „null“) und U163 (Szenenkarten passen auf 390 px Breite), 152 Browser-Fälle.

## 1.5.2 – 22.10.2026
- **Sessions:** Jede Session ist eine aufklappbare Zeile in der Liste. Der Inhalt steht direkt unter der Zeile statt am Seitenende, es ist höchstens eine Session offen und die neueste öffnet beim Start. Das Scrollen bleibt auch bei vielen Sessions kurz.
- **Tests:** U61 und U62 neu, Auswahl in U50, U51 und U55 angepasst, 150 Browser-Fälle.

## 1.5.1 – 22.10.2026
- **Anmeldung:** Bei einem Netzfehler prüft die Seite die Ursache und sagt sie: kein Internet, Server (supabase.co) von diesem Gerät aus nicht erreichbar (dann Hinweis auf Werbeblocker, VPN, privates DNS, Filter im WLAN) oder Server erreichbar (Seite neu laden, sonst melden). Der Hinweis zu Werbeblocker und Co. erscheint nur, wenn der Server tatsächlich nicht erreichbar ist.
- **Tests:** 3 neue Browser-Fälle (U02f, U02g, U02h), 148 gesamt.

## 1.5.0 – 22.10.2026
- **Chroniken:** Neuer Bereich „Chroniken“. Eine Chronik gliedert sich in Kapitel und Sessions und zeigt eine Zeitleiste. Der Storyteller legt Chroniken und Kapitel an, ordnet Sessions zu und sieht Lücken. Entwürfe sieht nur der Storyteller.
- **Sessions:** Zusammenfassung, Chronik, Kapitel und Ingame-Datum je Session (alle lesen, der Storyteller schreibt).
- **Szenenkarten (nur Storyteller):** Karten je Session mit Ort, Stimmung, Ziel, Gegenspieler, NPCs mit Motivation, Ausgängen, Ablauf, Fäden und Details. Status, Reihenfolge, Bearbeiten, Löschen.
- **Import:** Szenen als JSON im Format `kbn-scenes/1` (siehe `docs/Szenenformat_v1.md`) mit Prüfung und Vorschau. Ein zweiter Import ersetzt nichts.
- **NPC-Verknüpfung:** NPCs werden über die Notion-ID mit der ST-Karte verknüpft. Auf der ST-Karte zeigt „Kommt vor in“ die Szenen mit Motivation, ein NPC in der Szene springt zum Knoten.
- **Datenbank:** Migrationen `20261022120000_chronicles_v1_4.sql` und `20261022120100_chronicles_grants_v1_4.sql` (Rechte der neuen Tabellen nachgezogen, weil Supabase neue Tabellen für `anon` freigibt).
- **Tests:** Rechte 224 Fälle (57 neue), Browser 145 Fälle (14 neue). Der Rechte-Test bildet die Default Privileges von Supabase nach.
- **Doku:** Benutzerhandbuch und Technische Doku auf Version 1.5, neu `docs/Szenenformat_v1.md`.

## 1.4.0 – 21.10.2026
- **Karten:** Die Suche zeigt alle Treffer als Liste im Seitenfeld (Spielerkarte und Beziehungskarte). Mehrere Treffer sind zugeklappt, genau ein Treffer ist aufgeklappt. Alle Treffer werden auf der Karte hervorgehoben.
- **Storyteller:** „Auf Spielerkarte“ überträgt den Typ (Kindred, Sterblicher, …) nicht mehr. Die Spieler tragen ihn selbst ein, weil er nicht immer offensichtlich ist. Bereits übertragene Knoten behalten ihren Typ.
- **Tests:** Die UAT-Skripte liegen jetzt im Repo unter `tests/uat` (Rechte, Edge Function, Browser). Neue Browser-Fälle für die Suche.
- **Doku:** Benutzerhandbuch und Technische Doku auf Version 1.4.

## 1.3.1 – 21.10.2026
Dokumentation.

- **Neu:** `docs/Technische_Doku.md` (Architektur, Datenbank, Rechte, Edge Function, Betrieb) und `docs/Benutzerhandbuch.md` (Bedienung für Spieler und Storyteller). Beide sind lebende Dokumente, die Pflegeregel steht in der README.

## 1.3.0 – 21.10.2026
Storyteller als Administrator.

- **Rechte:** Der Storyteller darf alles sehen, ändern und löschen: private Notizen und Session-Notizen aller (auch im Namen anderer anlegen), Profile (Anzeigename, Rolle, anlegen, löschen), Notion-Cache und Dateien in fremden Ordnern. Migration `20261021120000_st_admin_v1_1.sql`.
- **Schutz:** Nur der ST ändert Rollen (Trigger `profiles_guard`). Die eigene Rolle und das eigene Profil sind gesperrt, damit sich der ST nicht aussperrt. Spieler behalten ihre bisherigen Rechte.
- **Oberfläche:** Noch unverändert. Bearbeiten und Löschen fremder Notizen über die App ist nicht eingebaut, die Rechte gelten auf Datenbankebene.

## 1.2.0 – 21.10.2026
Zwei Modi für Charakterbögen und Spielerkarte.

- **Ansicht und Bearbeitung:** Auf jedem Charakterbogen, den man ändern darf, und auf der Spielerkarte schaltet ein Schalter oben zwischen **Ansicht** (Standard, alles gesperrt) und **Bearbeitung** um. In der Ansicht sind Eingaben, Anlegen, Bearbeiten, Löschen, Verschieben und „Neu anordnen“ gesperrt. Suche, Filter und Auswählen bleiben möglich. Wer den Bogen nicht ändern darf, sieht nur die Ansicht und hat keinen Schalter. Beim Zurückschalten wird Ausstehendes gespeichert. Die ST-Karte (schreibgeschützt) hat keinen Schalter.

## 1.1.0 – 21.10.2026
Korrekturen aus dem UAT und Anmeldung mit Benutzername.

- **Login:** Anmeldung mit Benutzername statt E-Mail. Intern wird daraus `name@kbn.invalid`; eine eingetippte Adresse mit @ funktioniert weiter. Setup-Anleitung v1.1.
- **Karten:** Gespeicherte Positionen werden nicht mehr durch ein Standard-Raster überschrieben (Cytoscape `layout: preset`).
- **Notion-Cache:** Migration `20261020120400_notion_cache_service_role_v1_0.sql` gibt `service_role` das Recht auf `notion_cache`.
- **Charakterbogen:** Zahlenfelder (Blood Potency, XP) zeichnen den Bogen nicht mehr neu, Eingabe und Fokus bleiben erhalten.
- **Tests:** Der Smoke-Test nutzt das Feld `#login-user`.

## 1.0.0 – 20.10.2026
Neubau als statische Website (GitHub Pages) mit Supabase. Er ersetzt das claude.ai-Artifact v1.

- **Bereiche:** Übersicht, Charaktere (V5-Bogen), Sessions, Spielerkarte, Wiki, Dokumente, Privat, Storyteller.
- **Login:** Passwort-Konten, die Roland anlegt. Passwortänderung erfolgt in der Kopfleiste.
- **Rechte:** Alle Rechte sind serverseitig per RLS und Storage-Policies umgesetzt. Mitgliedschaft heißt, dass ein Profil existiert. Konten ohne Profil sehen nichts.
- **Notion:**
  - Edge Function `notion-proxy`, nur für den ST, mit Cache in `notion_cache` und dem Knopf „Aus Notion neu laden".
  - Nutzt die Data-Source-API (Notion-Version 2025-09-03) mit Fallback auf die alte Database-API.
- **Pause-Schutz:** GitHub-Actions-Ping montags und donnerstags.
- **Backlog umgesetzt:**
  - A1: schneller Zoom (Standard-Wheel-Sensitivität)
  - A2: Positionen dauerhaft in `map_positions`, inklusive automatischer Erstanordnung. Positionen werden vor dem Zeichnen geladen.
  - A3: „Ghul" wird als „Ghoul" angezeigt.
  - A4: Alle Knoten sind gleich groß.
  - A5: Knotenform je Sekte, nur auf der ST-Karte. Ohne Sekte und auf der Spielerkarte gilt ein Kreis.
  - A7: eigene Farbtöne für Wight, Geist, Werwolf, Organisation und Gegenstand. Der SC-Ring ist doppelt und in Tintenfarbe statt Messing.
- **Nicht umgesetzt** (bleibt im Backlog): A8 Porträts, B3 Orte/Organisationen als Knoten.
- **Tests:** RLS-Tests (Postgres 16), Edge-Function-Test (Deno), Browser-Smoke-Test (Playwright).
