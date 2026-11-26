/**
 * Modelo del informe ejecutivo (v2) listo para exportar. Se arma en el
 * servidor solo con información registrada y validada (sin consultas aquí):
 * los apartados sin datos se omiten y la numeración se ajusta sola.
 */
export type Tone = "dark" | "red" | "grey" | "light";

export type ReportBlock =
  | { kind: "facts"; rows: Array<[string, string]> }
  | { kind: "kpis"; items: Array<{ label: string; value: string; sub?: string }> }
  | { kind: "text"; body: string }
  | { kind: "list"; items: string[] }
  | { kind: "timeline"; items: Array<{ title: string; subtitle: string; period: string; bullets: string[] }> }
  | { kind: "matrix"; rows: Array<{ requirement: string; type: string; status: string; tone: Tone; evidence: string }> }
  | { kind: "bars"; rows: Array<{ label: string; value: number | null; display: string; note?: string }>; caption?: string }
  | { kind: "table"; headers: string[]; rows: string[][]; widths: number[] }
  | { kind: "recommendation"; label: string; tone: Tone; body: string };

export interface ReportSectionV2 {
  title: string;
  blocks: ReportBlock[];
}

export interface ReportModel {
  header: string;
  footer: string;
  templateVersion: string;
  title: string;
  candidateName: string;
  subtitle: string;
  client: string;
  reportVersion: number;
  finalizedAt: string;
  finalizedBy: string | null;
  recommendation: { label: string; tone: Tone };
  sections: ReportSectionV2[];
}

/** Nombre de archivo seguro: «Informe-ejecutivo-Nombre-Apellido-v2.pdf». */
export function reportFileName(candidateName: string, version: number, ext: "docx" | "pdf", prefix = "Informe-ejecutivo"): string {
  const base = candidateName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${prefix}-${base || "candidato"}-v${version}.${ext}`;
}

/** Texto plano limpio: sin caracteres de control (excepto saltos de línea) y con longitud acotada. */
export function cleanText(value: string | null | undefined, max = 20_000): string {
  return (value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max).trim();
}

/** Líneas de una lista escrita «una por línea» (quita viñetas). */
export function toItems(text: string | null | undefined): string[] {
  return cleanText(text)
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[•●▪◦\-–*·]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

/** ¿El bloque tiene contenido? (para ocultar lo vacío). */
export function blockHasContent(b: ReportBlock): boolean {
  switch (b.kind) {
    case "facts":
      return b.rows.some(([, v]) => cleanText(v));
    case "kpis":
      return b.items.length > 0;
    case "text":
      return Boolean(cleanText(b.body));
    case "list":
      return b.items.some((x) => cleanText(x));
    case "timeline":
    case "matrix":
    case "bars":
      return b.kind === "timeline" ? b.items.length > 0 : b.rows.length > 0;
    case "table":
      return b.rows.length > 0;
    case "recommendation":
      return true;
  }
}

/** Solo apartados con contenido, cada uno con sus bloques no vacíos. */
export function visibleSections(sections: ReportSectionV2[]): ReportSectionV2[] {
  return sections.map((s) => ({ ...s, blocks: s.blocks.filter(blockHasContent) })).filter((s) => s.blocks.length > 0);
}

// ---------------------------------------------------------------------
// Informe comparativo de terna
// ---------------------------------------------------------------------
export interface TernaModel {
  header: string;
  footer: string;
  title: string;
  vacancy: string;
  client: string;
  position: string | null;
  date: string;
  preparedBy: string | null;
  candidates: Array<{
    name: string;
    currentTitle: string;
    years: string;
    recommendation: { label: string; tone: Tone };
    weighted: number | null;
    mandatory: string;
    strengths: string[];
    toValidate: string[];
  }>;
  /** Requisito × candidato (en el mismo orden de candidates). */
  matrix: Array<{ requirement: string; type: string; cells: Array<{ status: string; tone: Tone }> }>;
}
