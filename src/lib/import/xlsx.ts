import { unzipSync } from "fflate";

/**
 * Lector mínimo de archivos Excel (.xlsx): primera hoja, textos compartidos,
 * texto en línea y números. Sin dependencias pesadas; se ejecuta en el
 * navegador, de modo que el archivo no se sube completo al servidor.
 * Protección contra archivos comprimidos maliciosos: límite de tamaño
 * descomprimido por archivo interno.
 */
const MAX_ENTRY_BYTES = 60 * 1024 * 1024;

function decode(xml: string): string {
  return xml
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function textOf(fragment: string): string {
  // Concatena todos los <t>…</t> (texto con formato enriquecido usa varios).
  let out = "";
  for (const m of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decode(m[1] ?? "");
  return out;
}

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+$/, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function numberToText(v: string): string {
  // Cédulas o teléfonos guardados como número: sin notación científica ni decimales «.0».
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return Number.isInteger(n) ? BigInt(Math.round(n)).toString() : String(n);
}

export function parseXlsx(bytes: Uint8Array, maxRows = 100_000): string[][] {
  const files = unzipSync(bytes, {
    filter: (f) => {
      const wanted = f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels" || f.name === "xl/sharedStrings.xml" || f.name.startsWith("xl/worksheets/sheet");
      if (wanted && f.originalSize > MAX_ENTRY_BYTES) throw new Error("El archivo Excel es demasiado grande.");
      return wanted;
    },
  });
  const td = new TextDecoder("utf-8");
  const read = (name: string) => (files[name] ? td.decode(files[name]) : null);

  // Primera hoja según el libro (no necesariamente sheet1.xml)
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = read("xl/workbook.xml");
  const rels = read("xl/_rels/workbook.xml.rels");
  const firstSheet = workbook?.match(/<sheet\b[^>]*\br:id="([^"]+)"/);
  if (firstSheet && rels) {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${firstSheet[1]}"`));
    const target = rel?.match(/Target="([^"]+)"/)?.[1];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheet = read(sheetPath) ?? read(Object.keys(files).find((k) => k.startsWith("xl/worksheets/sheet")) ?? "");
  if (!sheet) throw new Error("No se encontró ninguna hoja en el archivo Excel.");

  const shared: string[] = [];
  const sst = read("xl/sharedStrings.xml");
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1] ?? ""));

  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cm of (rm[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1] ?? "";
      const inner = cm[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s" && raw != null) value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = textOf(inner);
      else if (type === "str" || type === "e") value = raw != null ? decode(raw) : "";
      else if (type === "b") value = raw === "1" ? "VERDADERO" : "FALSO";
      else if (raw != null) value = numberToText(raw);
      const idx = ref ? colIndex(ref) : cells.length;
      while (cells.length < idx) cells.push("");
      cells[idx] = value;
    }
    if (cells.some((c) => c.trim() !== "")) rows.push(cells);
    if (rows.length > maxRows) break;
  }
  return rows;
}
