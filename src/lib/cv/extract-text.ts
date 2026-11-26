import { strFromU8, unzipSync } from "fflate";

export type TextQuality = "legible" | "parcial" | "ilegible";

export interface ExtractedText {
  text: string;
  pages: number;
  quality: TextQuality;
  note: string | null;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Texto de un documento Word (.docx): párrafos, saltos y tabulaciones; sin estilos. */
export function extractDocxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("El archivo Word no tiene contenido legible.");
  return decodeXml(
    strFromU8(xml)
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:tc>/g, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Calidad de la lectura: un PDF escaneado (imagen) casi no tiene texto por
 * página; un texto con muchos caracteres extraños se lee solo parcialmente.
 */
export function assessQuality(text: string, pages: number): { quality: TextQuality; note: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();
  const perPage = clean.length / Math.max(pages, 1);
  if (clean.length < 120 || perPage < 80) {
    return { quality: "ilegible", note: "El documento parece escaneado o no contiene texto seleccionable. Ingrese o corrija los datos manualmente." };
  }
  const letters = (clean.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const odd = (clean.match(/[�□\u0000-\u0008]/g) ?? []).length;
  if (letters / clean.length < 0.6 || odd > clean.length * 0.02) {
    return { quality: "parcial", note: "Parte del texto no se pudo interpretar (caracteres ilegibles). Revise con especial cuidado." };
  }
  return { quality: "legible", note: null };
}

/**
 * Lectura en el SERVIDOR: solo Word (.docx), que es liviano. Los PDF se leen en
 * el navegador del reclutador (src/lib/cv/extract-pdf.ts) para no exceder el
 * tamaño ni el tiempo de CPU del Worker; aquí solo se evalúa su calidad.
 */
export async function extractCvText(bytes: Uint8Array, mime: string): Promise<ExtractedText> {
  if (mime === "application/pdf") {
    return { text: "", pages: 0, quality: "ilegible", note: "El PDF no se pudo leer en el navegador. Intente de nuevo o complete el perfil manualmente." };
  }
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const text = extractDocxText(bytes);
    return { text, pages: Math.max(1, Math.ceil(text.length / 3000)), ...assessQuality(text, 1) };
  }
  return { text: "", pages: 0, quality: "ilegible", note: "Formato no admitido para lectura automática (use PDF o Word)." };
}
