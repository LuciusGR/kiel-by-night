# Browser-Smoke-Test

Lädt die Website mit einem In-Memory-Ersatz für supabase-js (`fake-supabase.js`, **ohne RLS**). Er öffnet jeden Bereich als ST und als Spieler, jeweils hell und dunkel. Der Test bricht bei JS-Fehlern ab und prüft das Speichern des Bogens sowie A2, also die Speicherung der Erstanordnung. Screenshots landen in `shots/`.

    cd tests/browser && npm install && npx playwright install chromium && npm test

Die Rechte werden hier **nicht** geprüft, dafür ist `tests/run_tests.sh` da.
