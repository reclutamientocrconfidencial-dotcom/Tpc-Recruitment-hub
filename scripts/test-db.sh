#!/usr/bin/env bash
# Pruebas de base de datos en un Postgres local efímero (sin Docker ni Supabase CLI).
# Aplica: shim de Supabase → migraciones → seed (ficticio) → pruebas RLS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${TEST_DB_PORT:-54329}"
DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tpc-db-XXXXXX")"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$DATA_DIR"
  RUN_AS=(sudo -u postgres)
fi

cleanup() {
  "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA_DIR" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$DATA_DIR" -U postgres --auth=trust >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA_DIR" -o "-p $PORT -k $DATA_DIR -c listen_addresses=''" -w start >/dev/null

PSQL=(psql -h "$DATA_DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

echo "→ Shim de Supabase"
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ Migración $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
echo "→ Seed (datos ficticios)"
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql"
echo "→ Pruebas RLS"
"${PSQL[@]}" -f "$ROOT/supabase/tests/rls_test.sql"
