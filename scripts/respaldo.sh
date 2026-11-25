#!/usr/bin/env bash
# Respaldo CIFRADO de la base de datos (esquemas public, private y auth).
#
# Variables:
#   RESPALDO_DB_URL         Cadena de conexión (credencial de solo lectura recomendada). Nunca en el repositorio.
#   RESPALDO_GPG_PUBLIC_KEY Archivo con la CLAVE PÚBLICA GPG de la empresa (la privada se custodia fuera de GitHub).
#   RESPALDO_DIR            Carpeta de salida (por defecto ./respaldos).
#   PGDUMP                  Comando pg_dump (por defecto, imagen oficial postgres:17 en Docker).
#
# El archivo sin cifrar existe solo en una carpeta temporal y se borra al terminar.
set -euo pipefail

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

echo "→ Cifrando con la clave pública…"
FILE="$OUT_DIR/tpc-respaldo-$STAMP.dump.gpg"
gpg --batch --yes --quiet --trust-model always --recipient-file "$RESPALDO_GPG_PUBLIC_KEY" --output "$FILE" --encrypt "$TMP/tpc.dump"
( cd "$OUT_DIR" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256" )
echo "✓ Respaldo cifrado: $FILE ($(wc -c < "$FILE") bytes)"
