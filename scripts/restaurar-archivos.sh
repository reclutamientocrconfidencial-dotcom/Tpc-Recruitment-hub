#!/usr/bin/env bash
# Descifra y VERIFICA un respaldo de archivos en una carpeta local (no sube nada a ningún servidor).
# Variables: RESPALDO_ARCHIVO (.tar.gpg), RESPALDO_GPG_PRIVATE_KEY (archivo), DESTINO_DIR (carpeta local vacía).
set -euo pipefail
: "${RESPALDO_ARCHIVO:?Falta RESPALDO_ARCHIVO}"
: "${RESPALDO_GPG_PRIVATE_KEY:?Falta RESPALDO_GPG_PRIVATE_KEY}"
: "${DESTINO_DIR:?Falta DESTINO_DIR}"
TMP="$(mktemp -d)"
trap 'find "$TMP" -type f -exec shred -u {} + 2>/dev/null || true; rm -rf "$TMP"' EXIT
export GNUPGHOME="$TMP/gnupg"; mkdir -m 700 "$GNUPGHOME"
if [ -f "$RESPALDO_ARCHIVO.sha256" ]; then ( cd "$(dirname "$RESPALDO_ARCHIVO")" && sha256sum -c --quiet "$(basename "$RESPALDO_ARCHIVO").sha256" ); fi
gpg --batch --quiet --import "$RESPALDO_GPG_PRIVATE_KEY"
gpg --batch --quiet --pinentry-mode loopback --passphrase "${RESPALDO_GPG_PASSPHRASE:-}" --output "$TMP/archivos.tar" --decrypt "$RESPALDO_ARCHIVO"
mkdir -p "$DESTINO_DIR"
tar -C "$DESTINO_DIR" -xf "$TMP/archivos.tar"
( cd "$DESTINO_DIR/archivos" && sha256sum -c --quiet ../archivos.sha256 )
echo "✓ Archivos restaurados y verificados en $DESTINO_DIR/archivos ($(find "$DESTINO_DIR/archivos" -type f | wc -l) archivos)"
