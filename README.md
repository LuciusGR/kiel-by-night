# Kiel by Night

Chronik-Website für die VTM-V5-Chronik „Kiel by Night". Sie ist statisch (GitHub Pages) und nutzt Supabase für Login, Daten und Dateien. Version siehe `CHANGELOG.md`.

Das Repo ist öffentlich. Es enthält **keine Spieldaten und keine Geheimnisse**. Der Supabase-anon/publishable-Key in `web/js/config.js` ist öffentlich vorgesehen, und der Schutz liegt in Row Level Security.

## Aufbau
```
web/                      Frontend ohne Build-Schritt (ES-Module, supabase-js + Cytoscape per CDN)
  js/config.js            Supabase-URL + anon key (ausfüllen)
  js/views/*.js           ein Modul pro Bereich; map.js = gemeinsame Kartenansicht
supabase/migrations/      Schema, RLS, Storage, Startdaten (in dieser Reihenfolge)
supabase/functions/notion-proxy/   liest Notion (nur ST), cached in notion_cache
.github/workflows/        pages.yml (Deploy), keepalive.yml (Ping gegen die 7-Tage-Pause)
docs/                     Setup-Anleitung, Review (versioniert)
tests/                    RLS-, Edge-Function- und Browser-Tests
```

## Einrichtung
Siehe `docs/Setup_Anleitung_v1_1.md`.

## Tests (lokal)
- `tests/run_tests.sh`: wendet alle Migrationen auf ein lokales Postgres 16 mit nachgebautem Supabase-Kern an und prüft die Rechte. Das braucht `postgresql-16`.
- `deno run --allow-net --allow-env --allow-read --allow-sys tests/notion_proxy_test.ts`: testet die Edge Function gegen einen Mock von Notion und Supabase.
- `tests/browser/`: Playwright-Smoke-Test aller Bereiche mit In-Memory-Supabase. Hinweise stehen in `tests/browser/README.md`.

## Rechte (Kurzfassung)
| Bereich | Lesen | Schreiben |
|---|---|---|
| Charakterbögen | alle | Besitzer + ST |
| Session-Notizen | alle | eigener Abschnitt |
| Private Notizen | Besitzer + ST | Besitzer |
| Spielerkarte | alle | alle |
| ST-Karte, Notion-Cache, ST-Positionen | ST | ST (Cache nur über die Function) |
| Wiki | alle (ST-Notizen nur ST) | alle; Kategorien umbenennen oder löschen nur ST; Seiten löschen: Ersteller + ST |
| Dokumente | alle (Entwürfe nur ST) | alle hochladen; löschen: Uploader + ST; freigeben: ST |
