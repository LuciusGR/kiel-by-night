# Changelog · Kiel by Night Website

Versionierung: `MAJOR.MINOR.PATCH`. MAJOR steht für Architekturwechsel, MINOR für neue Funktionen oder Schemaänderungen, PATCH für Korrekturen.
Dokumente in `docs/` und Migrationen tragen ihre Version im Dateinamen (`_vX_Y`) und werden nie überschrieben. Ausnahme: `Technische_Doku.md` und `Benutzerhandbuch.md` sind lebende Dokumente (Version im Kopf, Änderungsliste am Ende) und werden bei jeder Änderung an Funktionen, Rechten, Datenbank oder Betrieb mitgepflegt. Änderungen am Schema kommen immer als **neue** Migration.

## 1.4.0 – 21.10.2026
- **Karten:** Die Suche zeigt alle Treffer als Liste im Seitenfeld (Spielerkarte und Beziehungskarte). Mehrere Treffer sind zugeklappt, genau ein Treffer ist aufgeklappt. Alle Treffer werden auf der Karte hervorgehoben.
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
