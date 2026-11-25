import type { CvMime } from "@/types/database";

export const CV_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Determina el tipo REAL de un currículum por su contenido (firma o "bytes
 * mágicos"), sin confiar en la extensión ni en el tipo que declara el navegador.
 * Acepta solo PDF y Word (.docx). Devuelve null para cualquier otro archivo.
 */
export function detectCvType(bytes: Uint8Array): CvMime | null {
  if (bytes.length < 8) return null;
  // PDF: "%PDF-"
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "application/pdf";
  }
  // DOCX: contenedor ZIP ("PK\x03\x04") con la carpeta "word/" del formato Office Open XML.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const text = new TextDecoder("latin1").decode(bytes);
    if (text.includes("[Content_Types].xml") && text.includes("word/")) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
  }
  return null;
}

export function cvExtension(mime: CvMime): "pdf" | "docx" {
  return mime === "application/pdf" ? "pdf" : "docx";
}

/** Valida tamaño y tipo. Devuelve el tipo detectado o un mensaje de error en español. */
export function validateCv(bytes: Uint8Array): { mime: CvMime; error: null } | { mime: null; error: string } {
  if (bytes.length === 0) return { mime: null, error: "El archivo está vacío." };
  if (bytes.length > CV_MAX_BYTES) return { mime: null, error: "El currículum no puede superar 5 MB." };
  const mime = detectCvType(bytes);
  if (!mime) return { mime: null, error: "Solo se aceptan currículums en PDF o Word (.docx)." };
  return { mime, error: null };
}

/** Nombre de archivo seguro para mostrar (sin rutas ni caracteres especiales). */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.normalize("NFC").replace(/[^0-9A-Za-zÁÉÍÓÚáéíóúÑñÜü ._-]/g, "").trim().slice(0, 150);
  return clean || "curriculum";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
