#!/usr/bin/env bash
# Prueba de recuperación (CI y local): respaldo cifrado del Supabase LOCAL →
# restauración en una base vacía → comparación de conteos por tabla.
# Usa una clave GPG temporal generada para la prueba (nunca la real de la empresa).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${PRUEBA_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
DST="${SRC%/*}/restauracion_prueba"
PSQL="${PSQL:-docker run --rm -i --network host postgres:17 psql}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export GNUPGHOME="$WORK/gnupg"; mkdir -m 700 "$GNUPGHOME"

echo "→ Clave GPG temporal de prueba"
gpg --batch --quiet --passphrase '' --quick-gen-key "Prueba de respaldo TPC <respaldo@tpc-demo.test>" default default never
gpg --batch --quiet --armor --export respaldo@tpc-demo.test > "$WORK/publica.asc"
gpg --batch --quiet --armor --pinentry-mode loopback --passphrase '' --export-secret-keys respaldo@tpc-demo.test > "$WORK/privada.asc"

RESPALDO_DB_URL="$SRC" RESPALDO_GPG_PUBLIC_KEY="$WORK/publica.asc" RESPALDO_DIR="$WORK/out" "$ROOT/scripts/respaldo.sh"
FILE="$(ls "$WORK"/out/*.dump.gpg)"
if gpg --batch --list-packets "$FILE" >/dev/null 2>&1 && ! head -c 5 "$FILE" | grep -q PGDMP; then echo "✓ El archivo está cifrado"; else echo "El archivo NO está cifrado" >&2; exit 1; fi

# shellcheck disable=SC2086
echo "drop database if exists restauracion_prueba; create database restauracion_prueba;" | $PSQL -v ON_ERROR_STOP=1 -q "$SRC"
RESPALDO_ARCHIVO="$FILE" RESPALDO_GPG_PRIVATE_KEY="$WORK/privada.asc" DESTINO_DB_URL="$DST" "$ROOT/scripts/restaurar-respaldo.sh"

COUNT_SQL="select string_agg(format('%s.%s=%s', schemaname, relname, n), ',' order by schemaname, relname) from (
  select table_schema as schemaname, table_name as relname,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int as n
  from information_schema.tables where table_schema in ('public', 'private') and table_type = 'BASE TABLE') t"
# shellcheck disable=SC2086
A="$(echo "$COUNT_SQL" | $PSQL -At "$SRC")"
# shellcheck disable=SC2086
B="$(echo "$COUNT_SQL" | $PSQL -At "$DST")"
# shellcheck disable=SC2086
POLICIES="$(echo "select count(*) from pg_policies where schemaname = 'public'" | $PSQL -At "$DST")"
# shellcheck disable=SC2086
echo "drop database if exists restauracion_prueba;" | $PSQL -q "$SRC"
if [ "$A" != "$B" ] || [ -z "$A" ]; then
  echo "Los conteos no coinciden tras restaurar:" >&2; echo "origen:   $A" >&2; echo "restaurado: $B" >&2; exit 1
fi
[ "$POLICIES" -gt 20 ] || { echo "Faltan políticas RLS en la base restaurada ($POLICIES)." >&2; exit 1; }
echo "✓ Recuperación verificada: $(echo "$A" | tr ',' '\n' | wc -l) tablas con los mismos registros y $POLICIES políticas RLS."
