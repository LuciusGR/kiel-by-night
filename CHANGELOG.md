# Changelog · Kiel by Night Website

Versionierung: `MAJOR.MINOR.PATCH`. MAJOR steht für Architekturwechsel, MINOR für neue Funktionen oder Schemaänderungen, PATCH für Korrekturen.
Dokumente in `docs/` und Migrationen tragen ihre Version im Dateinamen (`_vX_Y`) und werden nie überschrieben. Ausnahme: `Technische_Doku.md` und `Benutzerhandbuch.md` sind lebende Dokumente (Version im Kopf, Änderungsliste am Ende) und werden bei jeder Änderung an Funktionen, Rechten, Datenbank oder Betrieb mitgepflegt. Änderungen am Schema kommen immer als **neue** Migration.

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
