#!/usr/bin/env bash
# Respaldo CIFRADO de la base de datos (esquemas public, private y auth).
#
# Variables:
#   RESPALDO_DB_URL         Cadena de conexión (credencial de solo lectura recomendada). Nunca en el repositorio.
#   RESPALDO_GPG_PUBLIC_KEY Archivo con la CLAVE PÚBLICA GPG de la empresa (la privada se custodia fuera de GitHub).
#   RESPALDO_DIR            Carpeta de salida (por defecto ./respaldos).
#   PGDUMP                  Comando pg_dump (por defecto, imagen oficial postgres:17 en Docker).
#   RESPALDO_VERIFICAR_DB_URL  (opcional) Base LOCAL vacía donde se restaura el respaldo ANTES de cifrarlo para
#                           comprobar que se recupera completo (mismos registros por tabla que el origen).
#
# El archivo sin cifrar existe solo en una carpeta temporal y se borra al terminar.
set -euo pipefail
VERIFICACION_FALLIDA=0

: "${RESPALDO_DB_URL:?Falta RESPALDO_DB_URL}"
: "${RESPALDO_GPG_PUBLIC_KEY:?Falta RESPALDO_GPG_PUBLIC_KEY (archivo de clave pública)}"
OUT_DIR="${RESPALDO_DIR:-./respaldos}"
PGDUMP="${PGDUMP:-docker run --rm --network host postgres:17 pg_dump}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TMP="$(mktemp -d)"
trap 'find "$TMP" -type f -exec shred -u {} + 2>/dev/null || true; rm -rf "$TMP"' EXIT
mkdir -p "$OUT_DIR"
export GNUPGHOME="$TMP/gnupg"; mkdir -m 700 "$GNUPGHOME"

echo "→ Exportando (formato personalizado de pg_dump)…"
# shellcheck disable=SC2086
$PGDUMP --format=custom --no-owner --schema=public --schema=private --schema=auth "$RESPALDO_DB_URL" > "$TMP/tpc.dump"
SIZE=$(wc -c < "$TMP/tpc.dump")
[ "$SIZE" -gt 1024 ] || { echo "El respaldo está vacío o incompleto ($SIZE bytes)." >&2; exit 1; }

if [ -n "${RESPALDO_VERIFICAR_DB_URL:-}" ]; then
  if ! [[ "$RESPALDO_VERIFICAR_DB_URL" =~ @(localhost|127\.0\.0\.1)(:[0-9]+)?/ ]]; then
    echo "La verificación solo restaura en una base de datos LOCAL." >&2; exit 1
  fi
  PSQL="${PSQL:-docker run --rm -i --network host postgres:17 psql}"
  PGRESTORE="${PGRESTORE:-docker run --rm -i --network host -v $TMP:/w postgres:17 pg_restore}"
  PGRESTORE_DIR="${PGRESTORE_DIR:-/w}"
  echo "→ Verificando la recuperación en una base local vacía…"
  # shellcheck disable=SC2086
  echo "drop schema if exists public cascade; create schema if not exists extensions; create extension if not exists pg_trgm schema extensions; create extension if not exists pgcrypto schema extensions; create extension if not exists \"uuid-ossp\" schema extensions;" | $PSQL -v ON_ERROR_STOP=1 -q "$RESPALDO_VERIFICAR_DB_URL"
  chmod 644 "$TMP/tpc.dump"
  # shellcheck disable=SC2086
  $PGRESTORE -l "$PGRESTORE_DIR/tpc.dump" | grep -v 'DEFAULT ACL' > "$TMP/lista.txt"
  chmod 644 "$TMP/lista.txt"
  # shellcheck disable=SC2086
  if ! $PGRESTORE --no-owner --exit-on-error -L "$PGRESTORE_DIR/lista.txt" --dbname "$RESPALDO_VERIFICAR_DB_URL" "$PGRESTORE_DIR/tpc.dump"; then
    echo "La restauración de verificación falló (vea el error anterior)." >&2
    VERIFICACION_FALLIDA=1
  fi
  COUNT_SQL="select coalesce(string_agg(format('%s.%s=%s', table_schema, table_name,
      (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text), ',' order by table_schema, table_name), '')
    from information_schema.tables where table_schema in ('public', 'private') and table_type = 'BASE TABLE'"
  # shellcheck disable=SC2086
  A="$(echo "$COUNT_SQL" | $PSQL -At "$RESPALDO_DB_URL")"
  # shellcheck disable=SC2086
  B="$(echo "$COUNT_SQL" | $PSQL -At "$RESPALDO_VERIFICAR_DB_URL")"
  # shellcheck disable=SC2086
  USERS_A="$(echo "select count(*) from auth.users" | $PSQL -At "$RESPALDO_DB_URL")"
  # shellcheck disable=SC2086
  USERS_B="$(echo "select count(*) from auth.users" | $PSQL -At "$RESPALDO_VERIFICAR_DB_URL")"
  # shellcheck disable=SC2086
  POLICIES="$(echo "select count(*) from pg_policies where schemaname = 'public'" | $PSQL -At "$RESPALDO_VERIFICAR_DB_URL")"
  if [ -z "$A" ] || [ "$A" != "$B" ] || [ "$USERS_A" != "$USERS_B" ]; then
    echo "La recuperación NO coincide con el origen." >&2
    echo "origen:     $A · usuarios=$USERS_A" >&2
    echo "restaurado: $B · usuarios=$USERS_B" >&2
    VERIFICACION_FALLIDA=1
  else
    echo "✓ Recuperación verificada: $(echo "$A" | tr ',' '\n' | wc -l) tablas con los mismos registros, $USERS_B usuario(s) y $POLICIES políticas RLS."
  fi
fi

echo "→ Cifrando con la clave pública…"
FILE="$OUT_DIR/tpc-respaldo-$STAMP.dump.gpg"
gpg --batch --yes --quiet --trust-model always --recipient-file "$RESPALDO_GPG_PUBLIC_KEY" --output "$FILE" --encrypt "$TMP/tpc.dump"
( cd "$OUT_DIR" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256" )
echo "✓ Respaldo cifrado: $FILE ($(wc -c < "$FILE") bytes)"
# El respaldo cifrado se conserva aunque la verificación falle, pero el proceso termina en error para revisarlo.
if [ "${VERIFICACION_FALLIDA:-0}" = 1 ]; then
  echo "✗ El respaldo se generó, pero su recuperación NO se pudo verificar. Revise antes de aplicar migraciones." >&2
  exit 2
fi
