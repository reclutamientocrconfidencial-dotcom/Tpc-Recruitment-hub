#!/usr/bin/env bash
# Prueba de recuperación de ARCHIVOS (CI y local) contra el Supabase LOCAL:
# sube archivos ficticios al bucket → respaldo cifrado (S3) → descifrado → sumas de verificación.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export GNUPGHOME="$WORK/gnupg"; mkdir -m 700 "$GNUPGHOME"
eval "$(npx supabase status -o env | grep -E '^(API_URL|SECRET_KEY|S3_PROTOCOL_ACCESS_KEY_ID|S3_PROTOCOL_ACCESS_KEY_SECRET|S3_PROTOCOL_REGION)=')"
# Clave LOCAL del stack de desarrollo (solo para subir archivos ficticios de prueba).
for i in 1 2; do
  printf '%%PDF-1.4 archivo ficticio %s %s\n' "$i" "$(date +%s%N)" > "$WORK/f$i.pdf"
  curl -sf -X POST "$API_URL/storage/v1/object/curriculums/prueba-respaldo/f$i.pdf" -H "Authorization: Bearer $SECRET_KEY" \
    -H "apikey: $SECRET_KEY" -H "Content-Type: application/pdf" -H "x-upsert: true" --data-binary "@$WORK/f$i.pdf" >/dev/null
done
gpg --batch --quiet --passphrase '' --quick-gen-key "Prueba de archivos TPC <archivos@tpc-demo.test>" default default never
gpg --batch --quiet --armor --export archivos@tpc-demo.test > "$WORK/publica.asc"
gpg --batch --quiet --armor --pinentry-mode loopback --passphrase '' --export-secret-keys archivos@tpc-demo.test > "$WORK/privada.asc"
export AWS_ACCESS_KEY_ID="$S3_PROTOCOL_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$S3_PROTOCOL_ACCESS_KEY_SECRET"
if ! command -v aws >/dev/null; then
  AWS="docker run --rm --network host -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION -v $WORK:$WORK amazon/aws-cli:2.22.35"; export AWS
fi
RESPALDO_S3_ENDPOINT="$API_URL/storage/v1/s3" RESPALDO_S3_REGION="$S3_PROTOCOL_REGION" RESPALDO_GPG_PUBLIC_KEY="$WORK/publica.asc" \
  RESPALDO_DIR="$WORK/out" TMPDIR="$WORK" "$ROOT/scripts/respaldo-archivos.sh"
FILE="$(ls "$WORK"/out/*.tar.gpg)"
if tar -tf "$FILE" >/dev/null 2>&1; then echo "El respaldo de archivos NO está cifrado" >&2; exit 1; fi
RESPALDO_ARCHIVO="$FILE" RESPALDO_GPG_PRIVATE_KEY="$WORK/privada.asc" DESTINO_DIR="$WORK/rest" "$ROOT/scripts/restaurar-archivos.sh"
for i in 1 2; do cmp -s "$WORK/f$i.pdf" "$WORK/rest/archivos/prueba-respaldo/f$i.pdf" || { echo "El archivo f$i no coincide" >&2; exit 1; }; done
echo "✓ Recuperación de archivos verificada (contenido idéntico)."
