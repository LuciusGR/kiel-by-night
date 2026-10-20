#!/usr/bin/env bash
# Lokaler Test der Migrationen + RLS mit Postgres 16 (ohne Docker). Aufruf: tests/run_tests.sh
set -euo pipefail
cd "$(dirname "$0")"
BIN=/usr/lib/postgresql/16/bin
DATA="$PWD/.pgdata"; PORT=54329
rm -rf "$DATA"; mkdir -p "$DATA"; chown -R postgres "$DATA" 2>/dev/null || true
run(){ if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
run "$BIN/initdb -D '$DATA' -U postgres -A trust >/dev/null"
run "$BIN/pg_ctl -D '$DATA' -o '-p $PORT -k /tmp' -l '$DATA/log' start >/dev/null"
trap 'run "$BIN/pg_ctl -D \"$DATA\" stop -m fast >/dev/null"' EXIT
PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "create database kbn"
$PSQL -d kbn -f mock_supabase.sql
for f in ../supabase/migrations/*.sql; do echo "== $f"; $PSQL -d kbn -f "$f"; done
echo "== rls_test.sql"; $PSQL -d kbn -o /dev/null -f rls_test.sql
echo "ALLE TESTS BESTANDEN"
