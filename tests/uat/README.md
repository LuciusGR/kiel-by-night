# UAT (Rechte, Edge Function, Browser)

Umfangreiche Abnahmetests für die Website. Sie laufen lokal und ändern nichts an Supabase, GitHub oder Notion.

| Test | Aufruf | Prüft | Soll-Stand 22.10.2026 |
|---|---|---|---|
| Rechte | `npm run rls` | alle Rollen (anonym, ohne Profil, Spieler, ST) lesen, anlegen, ändern, löschen, dazu Konfiguration der Datenbank. Läuft auf PGlite (PostgreSQL) mit allen Migrationen aus `supabase/migrations` | 230 von 230 |
| Edge Function | `npm run function` | `notion-proxy` mit gespieltem Notion und Supabase | 24 von 24 |
| Browser | `npm run ui` | alle Bereiche, beide Rollen, Handy, Barrierefreiheit, Kontrast, Sicherheit, Modi (Chrome, Attrappe von Supabase ohne RLS aus `tests/browser/fake-supabase.js`) | 158 von 158 |

## Voraussetzungen
- Node.js 24 (TypeScript-Dateien laufen direkt) und Chrome. Pfad zu Chrome per `CHROME` setzen, zum Beispiel `CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"`. Ohne `CHROME` nutzt Playwright seinen eigenen Browser (`npx playwright install chromium`).
- Einmal im Ordner `tests/uat`: `npm install`

## Hinweise
- `npm run ui` akzeptiert ein Muster für einzelne Fälle: `node ui_uat.mjs "^U(31|39)$"`. Ein Teillauf überschreibt `out/ui_results.json`.
- Ergebnisse und Bildschirmfotos fehlgeschlagener Fälle landen in `out/` (nicht im Git).
- **Rechte-Test niemals gegen die echte Datenbank ausführen** (legt Testkonten an).
- Ändert sich ein Recht, die Erwartung in `uat_rls.sql` anpassen: `pg_temp.q('Rxx', 'Beschreibung', Rolle, 'Rolle', 'SQL', 'Erwartung')` mit `err`, `rows=N`, `n=N` oder Alternativen mit `|`. Gegenproben für Spieler ergänzen.
- Ändert sich die Bedienung, die Fälle in `ui_uat.mjs` anpassen (`T("Uxx", Bereich, Name, async () => { ... })`).
- Zu Aufbau und Rechten siehe `docs/Technische_Doku.md`.
