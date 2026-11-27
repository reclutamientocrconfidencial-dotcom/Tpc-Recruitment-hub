#!/usr/bin/env bash
# Respaldo CIFRADO de los archivos privados (bucket «curriculums» de Supabase Storage).
#
# Usa el protocolo S3 de Supabase Storage con credenciales de ACCESO SOLO A STORAGE
# (Project Settings → Storage → S3 Access Keys), nunca la clave secreta del proyecto.
# Variables:
#   RESPALDO_S3_ENDPOINT     p. ej. https://<proyecto>.supabase.co/storage/v1/s3
#   RESPALDO_S3_REGION       región del proyecto (p. ej. us-east-1)
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  credenciales S3 de Storage (secretos)
#   RESPALDO_GPG_PUBLIC_KEY  archivo con la CLAVE PÚBLICA GPG de la empresa
#   RESPALDO_BUCKET          por defecto «curriculums»
#   RESPALDO_DIR             carpeta de salida (por defecto ./respaldos)
#   AWS                      comando de la CLI de AWS (por defecto «aws»)
# Los archivos sin cifrar existen solo en una carpeta temporal y se borran al terminar.
set -euo pipefail

: "${RESPALDO_S3_ENDPOINT:?Falta RESPALDO_S3_ENDPOINT}"
: "${AWS_ACCESS_KEY_ID:?Falta AWS_ACCESS_KEY_ID}"
: "${AWS_SECRET_ACCESS_KEY:?Falta AWS_SECRET_ACCESS_KEY}"
: "${RESPALDO_GPG_PUBLIC_KEY:?Falta RESPALDO_GPG_PUBLIC_KEY (archivo de clave pública)}"
export AWS_DEFAULT_REGION="${RESPALDO_S3_REGION:-us-east-1}"
BUCKET="${RESPALDO_BUCKET:-curriculums}"
OUT_DIR="${RESPALDO_DIR:-./respaldos}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TMP="$(mktemp -d)"
trap 'find "$TMP" -type f -exec shred -u {} + 2>/dev/null || true; rm -rf "$TMP"' EXIT
mkdir -p "$OUT_DIR" "$TMP/archivos"
export GNUPGHOME="$TMP/gnupg"; mkdir -m 700 "$GNUPGHOME"
AWS="${AWS:-aws}"

echo "→ Descargando el bucket «$BUCKET»…"
# shellcheck disable=SC2086
$AWS s3 sync "s3://$BUCKET" "$TMP/archivos" --endpoint-url "$RESPALDO_S3_ENDPOINT" --only-show-errors
N=$(find "$TMP/archivos" -type f | wc -l)
( cd "$TMP/archivos" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum ) > "$TMP/archivos.sha256"
tar -C "$TMP" -cf "$TMP/archivos.tar" archivos archivos.sha256

echo "→ Cifrando $N archivo(s) con la clave pública…"
FILE="$OUT_DIR/tpc-archivos-$STAMP.tar.gpg"
gpg --batch --yes --quiet --trust-model always --recipient-file "$RESPALDO_GPG_PUBLIC_KEY" --output "$FILE" --encrypt "$TMP/archivos.tar"
( cd "$OUT_DIR" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256" )
echo "✓ Respaldo de archivos cifrado: $FILE ($N archivos, $(wc -c < "$FILE") bytes)"
