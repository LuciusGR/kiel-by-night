# Changelog · Kiel by Night Website

Versionierung: `MAJOR.MINOR.PATCH`. MAJOR steht für Architekturwechsel, MINOR für neue Funktionen oder Schemaänderungen, PATCH für Korrekturen.
Dokumente in `docs/` und Migrationen tragen ihre Version im Dateinamen (`_vX_Y`) und werden nie überschrieben. Änderungen am Schema kommen immer als **neue** Migration.

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
