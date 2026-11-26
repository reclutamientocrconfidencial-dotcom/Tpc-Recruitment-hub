import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { cleanText, type ReportModel } from "@/lib/report/model";

const RED = rgb(0.784, 0.063, 0.18);
const INK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.45, 0.45, 0.45);
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
      // Palabras más largas que la línea: se cortan.
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

/** PDF del informe ejecutivo, generado en el servidor sin servicios externos. */
export async function buildReportPdf(m: ReportModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(m.title));
  doc.setCreator("TPC Recruitment Hub");
  doc.setProducer("TPC Recruitment Hub");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const W = 612;
  const H = 792;
  const M = 56;
  const width = W - 2 * M;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const ensure = (h: number) => {
    if (y - h < M + 30) newPage();
  };
  const text = (t: string, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const font = o.font ?? regular;
    const size = o.size ?? 10.5;
    for (const line of wrapText(t, font, size, width)) {
      ensure(size + 4);
      page.drawText(line, { x: M, y: y - size, size, font, color: o.color ?? INK });
      y -= size + 4;
    }
    y -= o.gap ?? 6;
  };
  const heading = (t: string) => {
    ensure(40);
    y -= 6;
    text(t, { font: bold, size: 12.5, color: RED, gap: 2 });
  };
  const tableRows = (headers: string[], rows: string[][], cols: number[]) => {
    const size = 9;
    const drawRow = (cells: string[], header: boolean) => {
      const wrapped = cells.map((c, i) => wrapText(c, header ? bold : regular, size, cols[i]! - 8));
      const h = Math.max(...wrapped.map((l) => l.length)) * (size + 3) + 8;
      ensure(h);
      let x = M;
      wrapped.forEach((lines, i) => {
        page.drawRectangle({ x, y: y - h, width: cols[i]!, height: h, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.5, color: header ? INK : undefined });
        lines.forEach((line, j) => page.drawText(line, { x: x + 4, y: y - 4 - size - j * (size + 3), size, font: header ? bold : regular, color: header ? rgb(1, 1, 1) : INK }));
        x += cols[i]!;
      });
      y -= h;
    };
    drawRow(headers, true);
    rows.forEach((r) => drawRow(r, false));
    y -= 10;
  };

  // Encabezado
  text(m.header, { font: bold, size: 8.5, color: GREY, gap: 2 });
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.5, color: RED });
  y -= 16;
  text(m.title, { font: bold, size: 18, gap: 4 });
  text(m.candidateName, { font: bold, size: 14, color: RED, gap: 4 });
  text(`Vacante: ${m.vacancy}\nCliente: ${m.client}${m.position ? `\nPuesto: ${m.position}` : ""}`, { size: 10 });
  text(`Versión del informe: ${m.reportVersion} · Fecha: ${m.finalizedAt}${m.finalizedBy ? ` · Elaborado por: ${m.finalizedBy}` : ""}`, { size: 9, color: GREY });

  heading("Recomendación final");
  text(m.recommendation, { font: bold, size: 12 });
  if (m.assessments.length) {
    heading("Evaluaciones");
    tableRows(["Evaluación", "Exigencia", "Resultado", "Detalle"], m.assessments.map((a) => [a.name, a.requirement, a.result, a.detail]), [150, 85, 95, width - 330]);
  }
  if (m.interviews.length) {
    heading("Entrevistas");
    tableRows(["Fecha", "Modalidad", "Entrevistador(a)", "Recomendación"], m.interviews.map((i) => [i.date, i.kind, i.interviewer, i.recommendation]), [110, 90, 150, width - 350]);
  }
  for (const s of m.sections) {
    if (!cleanText(s.body)) continue;
    heading(s.title);
    text(s.body);
  }

  // Pie en todas las páginas
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const footer = wrapText(`${m.footer} · Plantilla ${m.templateVersion}`, italic, 7.5, width - 60);
    footer.forEach((line, j) => p.drawText(line, { x: M, y: 34 - j * 9, size: 7.5, font: italic, color: GREY }));
    const label = `Página ${i + 1} de ${pages.length}`;
    p.drawText(label, { x: W - M - regular.widthOfTextAtSize(label, 8), y: 34, size: 8, font: regular, color: GREY });
  });
  return doc.save();
}
