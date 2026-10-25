# Kiel by Night

Chronik-Website für die VTM-V5-Chronik „Kiel by Night". Sie ist statisch (GitHub Pages) und nutzt Supabase für Login, Daten und Dateien. Version siehe `CHANGELOG.md`.

Das Repo ist öffentlich. Es enthält **keine Spieldaten und keine Geheimnisse**. Der Supabase-anon/publishable-Key in `web/js/config.js` ist öffentlich vorgesehen, und der Schutz liegt in Row Level Security.

## Aufbau
```
web/                      Frontend ohne Build-Schritt (ES-Module, supabase-js + Cytoscape + Schriften lokal in vendor/ und fonts/, Markenhinweis in js/legal.js)
  js/config.js            Supabase-URL + anon key (ausfüllen)
  js/views/*.js           ein Modul pro Bereich; map.js = gemeinsame Kartenansicht
supabase/migrations/      Schema, RLS, Storage, Startdaten (in dieser Reihenfolge)
supabase/functions/notion-proxy/   liest Notion (nur ST), cached in notion_cache
.github/workflows/        pages.yml (Deploy), keepalive.yml (Ping gegen die 7-Tage-Pause)
docs/                     Technische Doku, Benutzerhandbuch (lebend), Setup-Anleitung, Review (versioniert)
tests/                    RLS-, Edge-Function- und Browser-Tests
```

## Einrichtung
Siehe `docs/Setup_Anleitung_v1_1.md`.

## Dokumentation
- [`docs/Technische_Doku.md`](docs/Technische_Doku.md): Architektur, Datenbank, Rechte, Edge Function, Betrieb.
- [`docs/Benutzerhandbuch.md`](docs/Benutzerhandbuch.md): Bedienung für Spieler und Storyteller.

**Pflege:** Beide Dokumente sind lebend. Bei jeder Änderung an Funktionen, Rechten, Datenbank, Edge Function oder Betrieb werden sie im selben Zug angepasst, die Änderung steht in der Änderungsliste am Ende des Dokuments und im `CHANGELOG.md`.

## Tests (lokal)
- `tests/run_tests.sh`: wendet alle Migrationen auf ein lokales Postgres 16 mit nachgebautem Supabase-Kern an und prüft die Rechte. Das braucht `postgresql-16`.
- `deno run --allow-net --allow-env --allow-read --allow-sys tests/notion_proxy_test.ts`: testet die Edge Function gegen einen Mock von Notion und Supabase.
- `tests/browser/`: Playwright-Smoke-Test aller Bereiche mit In-Memory-Supabase. Hinweise stehen in `tests/browser/README.md`.

## Rechte (Kurzfassung)
| Bereich | Lesen | Schreiben |
|---|---|---|
| Charakterbögen | alle | Besitzer + ST |
| Session-Notizen | alle | eigener Abschnitt; ST: alle ändern, löschen, im Namen anderer anlegen |
| Private Notizen | Besitzer + ST | Besitzer; ST: alle ändern, löschen, anlegen |
| Spielerkarte | alle | alle |
| ST-Karte, Notion-Cache, ST-Positionen | ST | ST (Cache auch direkt änderbar und löschbar) |
| Wiki | alle (ST-Notizen nur ST) | alle; Kategorien umbenennen oder löschen nur ST; Seiten löschen: Ersteller + ST |
| Dokumente | alle (Entwürfe nur ST) | alle hochladen; löschen: Uploader + ST; freigeben: ST |
| Profile und Rollen | alle (Profile) | Anzeigename: jede Person selbst; Rollen ändern, Profile anlegen und löschen: nur ST (nicht die eigene Rolle, nicht das eigene Profil) |

Der Storyteller darf alles sehen, ändern und löschen (Migration `20261021120000_st_admin_v1_1.sql`). Ausnahmen zum Schutz vor Aussperren: die eigene Rolle und das eigene Profil.
