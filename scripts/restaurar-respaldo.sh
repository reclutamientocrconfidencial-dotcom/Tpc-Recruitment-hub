#!/usr/bin/env bash
# Restaura un respaldo cifrado en una base de datos LOCAL VACÍA para verificarlo.
# Por seguridad se niega a restaurar sobre cualquier servidor remoto.
#
# Variables:
#   RESPALDO_ARCHIVO        Archivo .dump.gpg
#   RESPALDO_GPG_PRIVATE_KEY Archivo con la clave PRIVADA (solo en el equipo de quien restaura)
#   DESTINO_DB_URL          Base de datos local vacía (localhost/127.0.0.1)
#   PGRESTORE / PSQL        Comandos (por defecto, imagen postgres:17 en Docker)
set -euo pipefail

: "${RESPALDO_ARCHIVO:?Falta RESPALDO_ARCHIVO}"
: "${RESPALDO_GPG_PRIVATE_KEY:?Falta RESPALDO_GPG_PRIVATE_KEY}"
: "${DESTINO_DB_URL:?Falta DESTINO_DB_URL}"
if ! [[ "$DESTINO_DB_URL" =~ @(localhost|127\.0\.0\.1)(:[0-9]+)?/ ]]; then
  echo "Por seguridad, este script solo restaura en una base de datos LOCAL." >&2
  exit 1
fi
TMP="$(mktemp -d)"
# pg_restore en Docker con acceso a la carpeta temporal (archivo y lista de objetos).
PGRESTORE="${PGRESTORE:-docker run --rm -i --network host -v $TMP:/w postgres:17 pg_restore}"
PGRESTORE_DIR="${PGRESTORE_DIR:-/w}"
PSQL="${PSQL:-docker run --rm -i --network host postgres:17 psql}"
trap 'find "$TMP" -type f -exec shred -u {} + 2>/dev/null || true; rm -rf "$TMP"' EXIT
export GNUPGHOME="$TMP/gnupg"; mkdir -m 700 "$GNUPGHOME"

if [ -f "$RESPALDO_ARCHIVO.sha256" ]; then
  ( cd "$(dirname "$RESPALDO_ARCHIVO")" && sha256sum -c "$(basename "$RESPALDO_ARCHIVO").sha256" )
fi
gpg --batch --quiet --import "$RESPALDO_GPG_PRIVATE_KEY"
gpg --batch --quiet --output "$TMP/tpc.dump" --decrypt "$RESPALDO_ARCHIVO"

# shellcheck disable=SC2086
EXISTING="$(echo "select count(*) from information_schema.tables where table_schema in ('public','private','auth')" | $PSQL -At "$DESTINO_DB_URL")"
if [ "$EXISTING" != "0" ]; then
  echo "La base de destino no está vacía ($EXISTING tablas). Use una base nueva." >&2
  exit 1
fi
echo "→ Preparando la base vacía (extensiones)…"
# shellcheck disable=SC2086
echo "drop schema if exists public cascade; create schema if not exists extensions; create extension if not exists pg_trgm schema extensions; create extension if not exists pgcrypto schema extensions; create extension if not exists \"uuid-ossp\" schema extensions;" | $PSQL -v ON_ERROR_STOP=1 -q "$DESTINO_DB_URL"
echo "→ Restaurando…"
chmod 644 "$TMP/tpc.dump"
# Los «privilegios por omisión» de los roles internos de Supabase no se restauran
# (requieren superusuario y la plataforma ya los define).
# shellcheck disable=SC2086
$PGRESTORE -l "$PGRESTORE_DIR/tpc.dump" | grep -v 'DEFAULT ACL' > "$TMP/lista.txt"
chmod 644 "$TMP/lista.txt"
# shellcheck disable=SC2086
$PGRESTORE --no-owner --exit-on-error -L "$PGRESTORE_DIR/lista.txt" --dbname "$DESTINO_DB_URL" "$PGRESTORE_DIR/tpc.dump"
echo "✓ Restauración completada en $DESTINO_DB_URL"
