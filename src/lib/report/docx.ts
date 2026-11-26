import { strToU8, zipSync } from "fflate";
import { cleanText, type ReportModel } from "@/lib/report/model";

const RED = "C8102E";

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function run(text: string, o: { bold?: boolean; size?: number; color?: string; italic?: boolean } = {}): string {
  const props = [o.bold ? "<w:b/>" : "", o.italic ? "<w:i/>" : "", o.color ? `<w:color w:val="${o.color}"/>` : "", o.size ? `<w:sz w:val="${o.size * 2}"/>` : ""].join("");
  const lines = cleanText(text).split("\n");
  return lines
    .map((line, i) => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${i > 0 ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`)
    .join("");
}

function para(content: string, o: { align?: "center" | "right"; spacingAfter?: number; border?: boolean } = {}): string {
  const ppr = [
    o.align ? `<w:jc w:val="${o.align}"/>` : "",
    `<w:spacing w:after="${o.spacingAfter ?? 120}"/>`,
    o.border ? `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="${RED}"/></w:pBdr>` : "",
  ].join("");
  return `<w:p><w:pPr>${ppr}</w:pPr>${content}</w:p>`;
}

function cell(text: string, header = false, width = 2400): string {
  const shade = header ? `<w:shd w:val="clear" w:color="auto" w:fill="1A1A1A"/>` : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shade}</w:tcPr>${para(run(text, header ? { bold: true, color: "FFFFFF", size: 9 } : { size: 9 }), { spacingAfter: 0 })}</w:tc>`;
}

function table(headers: string[], rows: string[][], widths: number[]): string {
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"].map((b) => `<w:${b} w:val="single" w:sz="4" w:color="BFBFBF"/>`).join("");
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
    `<w:tr>${headers.map((h, i) => cell(h, true, widths[i])).join("")}</w:tr>` +
    rows.map((r) => `<w:tr>${r.map((c, i) => cell(c, false, widths[i])).join("")}</w:tr>`).join("") +
    `</w:tbl>`
  );
}

function heading(text: string): string {
  return para(run(text, { bold: true, size: 13, color: RED }), { spacingAfter: 80 });
}

/** Documento Word (.docx, Office Open XML) generado sin servicios externos. */
export function buildReportDocx(m: ReportModel): Uint8Array {
  const body: string[] = [];
  body.push(para(run(m.header, { bold: true, size: 9, color: "595959" }), { border: true }));
  body.push(para(run(m.title, { bold: true, size: 18 }), { spacingAfter: 60 }));
  body.push(para(run(m.candidateName, { bold: true, size: 14, color: RED })));
  body.push(
    para(
      run(`Vacante: ${m.vacancy}\nCliente: ${m.client}${m.position ? `\nPuesto: ${m.position}` : ""}\nVersión del informe: ${m.reportVersion} · Fecha: ${m.finalizedAt}${m.finalizedBy ? ` · Elaborado por: ${m.finalizedBy}` : ""}`, { size: 10 }),
    ),
  );
  body.push(heading("Recomendación final"));
  body.push(para(run(m.recommendation, { bold: true, size: 12 })));
  if (m.assessments.length) {
    body.push(heading("Evaluaciones"));
    body.push(table(["Evaluación", "Exigencia", "Resultado", "Detalle"], m.assessments.map((a) => [a.name, a.requirement, a.result, a.detail]), [2600, 1600, 1800, 3000]));
    body.push(para("", { spacingAfter: 120 }));
  }
  if (m.interviews.length) {
    body.push(heading("Entrevistas"));
    body.push(table(["Fecha", "Modalidad", "Entrevistador(a)", "Recomendación"], m.interviews.map((i) => [i.date, i.kind, i.interviewer, i.recommendation]), [2000, 1800, 2600, 2600]));
    body.push(para("", { spacingAfter: 120 }));
  }
  for (const s of m.sections) {
    if (!cleanText(s.body)) continue;
    body.push(heading(s.title));
    body.push(para(run(s.body, { size: 11 })));
  }
  body.push(para(run(`${m.footer}\nPlantilla ${m.templateVersion}`, { italic: true, size: 8, color: "7F7F7F" }), { spacingAfter: 0 }));

  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>` +
    `</w:body></w:document>`;
  const files = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    ),
    "docProps/core.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
        `<dc:title>${esc(m.title)}</dc:title><dc:creator>TPC Recruitment Hub</dc:creator></cp:coreProperties>`,
    ),
    "word/document.xml": strToU8(document),
  };
  return zipSync(files, { level: 6 });
}
