import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { cleanText, type ReportBlock, type ReportModel, type TernaModel, type Tone } from "@/lib/report/model";

// Identidad TPC: rojo, negro y blanco (grises solo de apoyo).
const RED = rgb(0.784, 0.063, 0.18);
const INK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.35, 0.35, 0.35);
const MUTED = rgb(0.55, 0.55, 0.55);
const RULE = rgb(0.85, 0.85, 0.85);
const SOFT = rgb(0.96, 0.96, 0.96);
const TRACK = rgb(0.92, 0.92, 0.92);
const WHITE = rgb(1, 1, 1);
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

/** Las fuentes estándar de PDF solo codifican WinAnsi (incluye tildes y ñ): el resto se reemplaza. */
export function pdfSafe(text: string): string {
  let out = "";
  for (const ch of cleanText(text)) {
    const c = ch.codePointAt(0)!;
    out += ch === "\n" || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.includes(ch) ? ch : "?";
  }
  return out;
}

/** Divide un texto en líneas que caben en el ancho indicado. */
export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of pdfSafe(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

const TONE: Record<Tone, { fill: RGB | undefined; text: RGB; border?: RGB }> = {
  dark: { fill: INK, text: WHITE },
  red: { fill: RED, text: WHITE },
  grey: { fill: rgb(0.45, 0.45, 0.45), text: WHITE },
  light: { fill: undefined, text: GREY, border: rgb(0.7, 0.7, 0.7) },
};

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

/** Lienzo con paginación, encabezado y pie corporativos en todas las páginas. */
class Canvas {
  static W = 612;
  static H = 792;
  static M = 50;
  static TOP = 84;
  static BOTTOM = 66;
  page!: PDFPage;
  y = 0;
  width = Canvas.W - 2 * Canvas.M;
  constructor(
    readonly doc: PDFDocument,
    readonly f: Fonts,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([Canvas.W, Canvas.H]);
    this.y = Canvas.H - Canvas.TOP;
  }
  /** Garantiza espacio; si no hay, salta de página y ejecuta `onBreak` (p. ej. repetir encabezados de tabla). */
  ensure(h: number, onBreak?: () => void) {
    if (this.y - h < Canvas.BOTTOM) {
      this.newPage();
      onBreak?.();
    }
  }
  text(t: string, x: number, y: number, o: { font?: PDFFont; size?: number; color?: RGB } = {}) {
    this.page.drawText(pdfSafe(t), { x, y, size: o.size ?? 10, font: o.font ?? this.f.regular, color: o.color ?? INK });
  }
  /** Párrafo con salto de página línea a línea. */
  paragraph(t: string, o: { x?: number; width?: number; font?: PDFFont; size?: number; color?: RGB; leading?: number; after?: number } = {}) {
    const size = o.size ?? 10;
    const lead = o.leading ?? size * 1.42;
    const x = o.x ?? Canvas.M;
    for (const line of wrapText(t, o.font ?? this.f.regular, size, o.width ?? this.width)) {
      this.ensure(lead);
      this.text(line, x, this.y - size, { font: o.font, size, color: o.color });
      this.y -= lead;
    }
    this.y -= o.after ?? 6;
  }
  chip(label: string, tone: Tone, x: number, yTop: number, size = 7.5, maxWidth = Infinity): number {
    const t = TONE[tone];
    // Reduce la letra si no cabe en la columna (mínimo 5,5 pt).
    while (size > 5.5 && this.f.bold.widthOfTextAtSize(pdfSafe(label), size) + 10 > maxWidth) size -= 0.5;
    const w = this.f.bold.widthOfTextAtSize(pdfSafe(label), size) + 10;
    const h = size + 6;
    this.page.drawRectangle({ x, y: yTop - h, width: w, height: h, color: t.fill, borderColor: t.border, borderWidth: t.border ? 0.6 : 0 });
    this.text(label, x + 5, yTop - h + 3.6, { font: this.f.bold, size, color: t.text });
    return w;
  }
}

function drawHeaderFooter(doc: PDFDocument, f: Fonts, o: { kicker: string; right: string; footer: string; meta: string }) {
  const { W, H, M } = Canvas;
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    // Banda superior y marca TPC
    p.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: RED });
    p.drawRectangle({ x: M, y: H - 52, width: 34, height: 34, color: RED });
    const mark = "TPC";
    p.drawText(mark, { x: M + 17 - f.bold.widthOfTextAtSize(mark, 11.5) / 2, y: H - 39.5, size: 11.5, font: f.bold, color: WHITE });
    p.drawText("The People Outsourcing Company S.A.", { x: M + 44, y: H - 31, size: 10.5, font: f.bold, color: INK });
    p.drawText(pdfSafe(o.kicker), { x: M + 44, y: H - 45, size: 8.5, font: f.regular, color: GREY });
    const conf = "CONFIDENCIAL";
    p.drawText(conf, { x: W - M - f.bold.widthOfTextAtSize(conf, 8.5), y: H - 31, size: 8.5, font: f.bold, color: RED });
    const right = pdfSafe(o.right);
    p.drawText(right, { x: W - M - f.regular.widthOfTextAtSize(right, 8), y: H - 45, size: 8, font: f.regular, color: GREY });
    p.drawLine({ start: { x: M, y: H - 62 }, end: { x: W - M, y: H - 62 }, thickness: 0.6, color: RULE });
    // Pie: aviso de confidencialidad y numeración
    p.drawLine({ start: { x: M, y: 50 }, end: { x: W - M, y: 50 }, thickness: 0.6, color: RULE });
    const lines = wrapText(o.footer, f.italic, 6.8, W - 2 * M - 80);
    lines.slice(0, 3).forEach((l, j) => p.drawText(l, { x: M, y: 40 - j * 8.5, size: 6.8, font: f.italic, color: MUTED }));
    const label = `Página ${i + 1} de ${pages.length}`;
    p.drawText(label, { x: W - M - f.bold.widthOfTextAtSize(label, 8), y: 40, size: 8, font: f.bold, color: INK });
    const meta = pdfSafe(o.meta);
    p.drawText(meta, { x: W - M - f.regular.widthOfTextAtSize(meta, 6.8), y: 31.5, size: 6.8, font: f.regular, color: MUTED });
  });
}

function sectionHeading(c: Canvas, n: number, title: string) {
  c.ensure(64);
  c.y -= 10;
  const { M } = Canvas;
  c.page.drawRectangle({ x: M, y: c.y - 18, width: 18, height: 18, color: RED });
  const num = String(n);
  c.text(num, M + 9 - c.f.bold.widthOfTextAtSize(num, 9.5) / 2, c.y - 12.6, { font: c.f.bold, size: 9.5, color: WHITE });
  c.text(title.toUpperCase(), M + 26, c.y - 13.5, { font: c.f.bold, size: 11.5, color: INK });
  c.page.drawLine({ start: { x: M + 26, y: c.y - 21 }, end: { x: M + c.width, y: c.y - 21 }, thickness: 0.6, color: RULE });
  c.y -= 32;
}

function drawTable(c: Canvas, headers: string[], rows: Array<Array<string | { chip: string; tone: Tone }>>, pct: number[], o: { size?: number } = {}) {
  const size = o.size ?? 8.8;
  const { M } = Canvas;
  const widths = pct.map((p) => (p / 100) * c.width);
  const header = () => {
    const h = size + 10;
    c.page.drawRectangle({ x: M, y: c.y - h, width: c.width, height: h, color: INK });
    let x = M;
    headers.forEach((t, i) => {
      c.text(t, x + 6, c.y - h + 6.2, { font: c.f.bold, size: size - 0.6, color: WHITE });
      x += widths[i]!;
    });
    c.y -= h;
  };
  c.ensure(size * 3 + 20);
  header();
  rows.forEach((r, ri) => {
    const wrapped = r.map((cell, i) => (typeof cell === "string" ? wrapText(cell || "—", c.f.regular, size, widths[i]! - 12) : null));
    const h = Math.max(1, ...wrapped.map((l) => l?.length ?? 1)) * (size + 3.2) + 9;
    c.ensure(h, header);
    if (ri % 2 === 1) c.page.drawRectangle({ x: M, y: c.y - h, width: c.width, height: h, color: SOFT });
    let x = M;
    r.forEach((cell, i) => {
      if (typeof cell === "string") {
        wrapped[i]!.forEach((line, j) => c.text(line, x + 6, c.y - 5 - size - j * (size + 3.2), { size, color: i === 0 ? INK : GREY, font: i === 0 ? c.f.bold : c.f.regular }));
      } else if (cell.chip === "—") c.text("—", x + 6, c.y - 5 - size, { size, color: MUTED });
      else c.chip(cell.chip, cell.tone, x + 6, c.y - 4.5, 7.5, widths[i]! - 10);
      x += widths[i]!;
    });
    c.page.drawLine({ start: { x: M, y: c.y - h }, end: { x: M + c.width, y: c.y - h }, thickness: 0.4, color: RULE });
    c.y -= h;
  });
  c.y -= 10;
}

function drawBlock(c: Canvas, b: ReportBlock) {
  const { M } = Canvas;
  const f = c.f;
  switch (b.kind) {
    case "facts": {
      const rows = b.rows.filter(([, v]) => cleanText(v));
      const colW = c.width / 2;
      for (let i = 0; i < rows.length; i += 2) {
        const pair = rows.slice(i, i + 2);
        const wrapped = pair.map(([, v]) => wrapText(v, f.regular, 9.8, colW - 14));
        const h = 13 + Math.max(...wrapped.map((w) => w.length)) * 13 + 6;
        c.ensure(h);
        pair.forEach(([label], k) => {
          const x = M + k * colW;
          c.text(label.toUpperCase(), x, c.y - 8, { font: f.bold, size: 6.8, color: MUTED });
          wrapped[k]!.forEach((line, j) => c.text(line, x, c.y - 21 - j * 13, { size: 9.8 }));
        });
        c.page.drawLine({ start: { x: M, y: c.y - h + 2 }, end: { x: M + c.width, y: c.y - h + 2 }, thickness: 0.4, color: RULE });
        c.y -= h;
      }
      c.y -= 8;
      break;
    }
    case "kpis": {
      const n = b.items.length;
      const gap = 10;
      const w = (c.width - gap * (n - 1)) / n;
      const h = 64;
      c.ensure(h + 10);
      b.items.forEach((k, i) => {
        const x = M + i * (w + gap);
        c.page.drawRectangle({ x, y: c.y - h, width: w, height: h, color: SOFT });
        c.page.drawRectangle({ x, y: c.y - h, width: 3, height: h, color: RED });
        c.text(k.label.toUpperCase(), x + 12, c.y - 15, { font: f.bold, size: 6.8, color: GREY });
        c.text(k.value, x + 12, c.y - 40, { font: f.bold, size: 22, color: INK });
        if (k.sub) wrapText(k.sub, f.regular, 6.8, w - 18).slice(0, 2).forEach((l, j) => c.text(l, x + 12, c.y - 51 - j * 8, { size: 6.8, color: MUTED }));
      });
      c.y -= h + 14;
      break;
    }
    case "text":
      c.paragraph(b.body, { size: 10, color: INK, after: 8 });
      break;
    case "list":
      for (const item of b.items) {
        const lines = wrapText(item, f.regular, 10, c.width - 16);
        c.ensure(lines.length * 14 + 2);
        c.page.drawRectangle({ x: M + 2, y: c.y - 8.5, width: 4, height: 4, color: RED });
        lines.forEach((l, j) => c.text(l, M + 14, c.y - 10 - j * 14, { size: 10 }));
        c.y -= lines.length * 14 + 3;
      }
      c.y -= 6;
      break;
    case "timeline": {
      for (const it of b.items) {
        const bullets = it.bullets.map((x) => wrapText(x, f.regular, 9.2, c.width - 34));
        const h = 16 + (it.subtitle ? 12 : 0) + bullets.reduce((s, l) => s + l.length * 12.4, 0) + 8;
        c.ensure(Math.min(h, 120));
        c.page.drawCircle({ x: M + 5, y: c.y - 6, size: 3.6, color: RED });
        c.text(it.title || "—", M + 18, c.y - 9.5, { font: f.bold, size: 10.5 });
        if (it.period) {
          const p = pdfSafe(it.period);
          c.text(p, M + c.width - f.regular.widthOfTextAtSize(p, 8.5), c.y - 9.5, { size: 8.5, color: GREY });
        }
        c.y -= 15;
        if (it.subtitle) {
          c.text(it.subtitle, M + 18, c.y - 8.5, { size: 9, color: GREY });
          c.y -= 12;
        }
        for (const lines of bullets) {
          c.ensure(lines.length * 12.4);
          c.text("–", M + 20, c.y - 9, { size: 9.2, color: MUTED });
          lines.forEach((l, j) => c.text(l, M + 30, c.y - 9 - j * 12.4, { size: 9.2, color: GREY }));
          c.y -= lines.length * 12.4;
        }
        c.y -= 8;
      }
      break;
    }
    case "matrix":
      drawTable(
        c,
        ["Requisito", "Tipo", "Estado", "Evidencia u observación"],
        b.rows.map((r) => [r.requirement, r.type, { chip: r.status, tone: r.tone }, r.evidence || "—"]),
        [38, 14, 16, 32],
      );
      break;
    case "table":
      drawTable(c, b.headers, b.rows, b.widths);
      break;
    case "bars": {
      const labelW = c.width * 0.36;
      const trackW = c.width * 0.42;
      const valueX = M + labelW + trackW + 12;
      for (const r of b.rows) {
        const label = wrapText(r.label, f.bold, 9, labelW - 8);
        const note = r.note ? wrapText(r.note, f.regular, 7.2, labelW - 8) : [];
        const h = Math.max(20, label.length * 11.5 + note.length * 9 + 8);
        c.ensure(h);
        label.forEach((l, j) => c.text(l, M, c.y - 10 - j * 11.5, { font: f.bold, size: 9 }));
        note.forEach((l, j) => c.text(l, M, c.y - 10 - label.length * 11.5 - j * 9 + 1, { size: 7.2, color: MUTED }));
        const ty = c.y - 13;
        c.page.drawRectangle({ x: M + labelW, y: ty, width: trackW, height: 8, color: TRACK });
        if (r.value != null && r.value > 0) c.page.drawRectangle({ x: M + labelW, y: ty, width: (trackW * Math.min(r.value, 100)) / 100, height: 8, color: RED });
        c.text(r.display, valueX, c.y - 12, { font: f.bold, size: 9, color: INK });
        c.y -= h;
      }
      if (b.caption) c.paragraph(b.caption, { size: 7.8, color: MUTED, after: 4 });
      c.y -= 6;
      break;
    }
    case "recommendation": {
      c.ensure(44);
      c.text("RECOMENDACIÓN DEL RECLUTADOR", M, c.y - 8, { font: f.bold, size: 6.8, color: MUTED });
      c.chip(b.label.toUpperCase(), b.tone, M, c.y - 13, 10);
      c.y -= 38;
      if (cleanText(b.body)) c.paragraph(b.body, { size: 10, after: 8 });
      break;
    }
  }
}

/** PDF del informe ejecutivo (generado en el servidor, sin servicios externos). */
export async function buildReportPdf(m: ReportModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${m.title} · ${m.candidateName}`));
  doc.setAuthor("The People Outsourcing Company S.A.");
  doc.setCreator("TPC Recruitment Hub");
  doc.setProducer("TPC Recruitment Hub");
  const f: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const c = new Canvas(doc, f);
  const { M } = Canvas;

  // Portada compacta: candidato, puesto, cliente y recomendación
  c.text(m.title.toUpperCase(), M, c.y - 8, { font: f.bold, size: 7.5, color: RED });
  c.y -= 14;
  for (const l of wrapText(m.candidateName, f.bold, 22, c.width - 170)) {
    c.text(l, M, c.y - 20, { font: f.bold, size: 22 });
    c.y -= 26;
  }
  c.text(m.subtitle, M, c.y - 10, { size: 10.5, color: GREY });
  c.text(`Cliente: ${m.client}`, M, c.y - 24, { size: 10.5, color: GREY });
  const recTop = c.y + 26 + 6;
  c.text("RECOMENDACIÓN", M + c.width - 160, recTop - 4, { font: f.bold, size: 6.8, color: MUTED });
  c.chip(m.recommendation.label.toUpperCase(), m.recommendation.tone, M + c.width - 160, recTop - 9, 8.5);
  c.y -= 34;
  c.page.drawRectangle({ x: M, y: c.y - 2, width: 60, height: 2, color: RED });
  c.y -= 10;

  m.sections.forEach((s, i) => {
    sectionHeading(c, i + 1, s.title);
    for (const b of s.blocks) drawBlock(c, b);
  });

  drawHeaderFooter(doc, f, {
    kicker: "Informe ejecutivo de candidato",
    right: `Versión ${m.reportVersion} · ${m.finalizedAt}`,
    footer: m.footer,
    meta: `Plantilla ${m.templateVersion}${m.finalizedBy ? ` · Elaborado por ${m.finalizedBy}` : ""}`,
  });
  return doc.save();
}

/** PDF del informe comparativo de terna. */
export async function buildTernaPdf(t: TernaModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${t.title} · ${t.vacancy}`));
  doc.setCreator("TPC Recruitment Hub");
  doc.setProducer("TPC Recruitment Hub");
  const f: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const c = new Canvas(doc, f);
  const { M } = Canvas;
  c.text(t.title.toUpperCase(), M, c.y - 8, { font: f.bold, size: 7.5, color: RED });
  c.y -= 14;
  c.paragraph(t.vacancy, { font: f.bold, size: 20, leading: 24, after: 2 });
  c.paragraph(`${t.position ? `${t.position} · ` : ""}Cliente: ${t.client}`, { size: 10.5, color: GREY, after: 6 });
  c.page.drawRectangle({ x: M, y: c.y - 2, width: 60, height: 2, color: RED });
  c.y -= 10;

  sectionHeading(c, 1, "Resumen de candidatos");
  drawTable(
    c,
    ["Candidato(a)", "Puesto actual", "Experiencia", "Obligatorios", "Ponderado", "Recomendación"],
    t.candidates.map((x) => [x.name, x.currentTitle, x.years, x.mandatory, x.weighted != null ? `${String(x.weighted).replace(".", ",")} / 100` : "—", { chip: x.recommendation.label, tone: x.recommendation.tone }]),
    [21, 21, 12, 12, 13, 21],
    { size: 8.4 },
  );
  if (t.candidates.some((x) => x.weighted != null)) {
    sectionHeading(c, 2, "Resultado ponderado de evaluaciones");
    drawBlock(c, { kind: "bars", rows: t.candidates.map((x) => ({ label: x.name, value: x.weighted, display: x.weighted != null ? `${String(x.weighted).replace(".", ",")} / 100` : "Sin datos" })), caption: "Solo evaluaciones aplicables a la vacante. La comparación es informativa: la decisión es del cliente y del reclutador." });
  }
  if (t.matrix.length) {
    sectionHeading(c, 3, "Matriz de cumplimiento comparada");
    const n = t.candidates.length;
    const reqPct = n > 4 ? 28 : 34;
    const each = (100 - reqPct) / n;
    drawTable(c, ["Requisito", ...t.candidates.map((x) => x.name.split(" ").slice(0, 2).join(" "))], t.matrix.map((r) => [`${r.requirement} (${r.type.toLowerCase()})`, ...r.cells.map((cell) => ({ chip: cell.status, tone: cell.tone }))]), [reqPct, ...t.candidates.map(() => each)], { size: 8.2 });
  }
  sectionHeading(c, 4, "Fortalezas y aspectos por validar");
  for (const x of t.candidates) {
    c.ensure(40);
    c.paragraph(x.name, { font: f.bold, size: 10.5, after: 2 });
    drawBlock(c, { kind: "list", items: [...x.strengths.map((s) => `Fortaleza: ${s}`), ...x.toValidate.map((s) => `Por validar: ${s}`)].length ? [...x.strengths.map((s) => `Fortaleza: ${s}`), ...x.toValidate.map((s) => `Por validar: ${s}`)] : ["Sin información registrada en el informe."] });
  }
  drawHeaderFooter(doc, f, { kicker: "Informe comparativo de terna", right: t.date, footer: t.footer, meta: t.preparedBy ? `Elaborado por ${t.preparedBy}` : "" });
  return doc.save();
}
