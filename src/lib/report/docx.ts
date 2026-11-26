import { strToU8, zipSync } from "fflate";
import { cleanText, type ReportBlock, type ReportModel, type TernaModel, type Tone } from "@/lib/report/model";

/** Identidad TPC: rojo, negro y blanco; grises solo de apoyo. */
const RED = "C8102E";
const INK = "1A1A1A";
const GREY = "595959";
const MUTED = "8C8C8C";
const RULE = "D9D9D9";
const SOFT = "F4F4F4";
const TRACK = "EAEAEA";
/** Ancho útil de la página carta con márgenes de 1,9 cm (dxa). */
const PAGE_W = 10086;

const TONE: Record<Tone, { fill: string | null; color: string }> = {
  dark: { fill: INK, color: "FFFFFF" },
  red: { fill: RED, color: "FFFFFF" },
  grey: { fill: "737373", color: "FFFFFF" },
  light: { fill: null, color: GREY },
};

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface RunOpts {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  color?: string;
  caps?: boolean;
  shade?: string;
  spacing?: number;
}

function run(text: string, o: RunOpts = {}): string {
  const props = [
    '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>',
    o.bold ? "<w:b/>" : "",
    o.italic ? "<w:i/>" : "",
    o.caps ? "<w:caps/>" : "",
    o.color ? `<w:color w:val="${o.color}"/>` : "",
    o.spacing ? `<w:spacing w:val="${o.spacing}"/>` : "",
    o.size ? `<w:sz w:val="${Math.round(o.size * 2)}"/><w:szCs w:val="${Math.round(o.size * 2)}"/>` : "",
    o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : "",
  ].join("");
  // Sin recortar espacios: forman parte del diseño (chips, numeración y «Página X de Y»).
  return (text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(0, 20_000)
    .split("\n")
    .map((line, i) => `<w:r><w:rPr>${props}</w:rPr>${i > 0 ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`)
    .join("");
}

interface ParaOpts {
  align?: "center" | "right" | "left";
  after?: number;
  before?: number;
  keepNext?: boolean;
  borderBottom?: { color: string; size: number };
  borderTop?: { color: string; size: number };
  indentLeft?: number;
  indentRight?: number;
  hanging?: number;
  tabRight?: number;
  line?: number;
}

function para(content: string, o: ParaOpts = {}): string {
  const bdr = o.borderBottom || o.borderTop
    ? `<w:pBdr>${o.borderTop ? `<w:top w:val="single" w:sz="${o.borderTop.size}" w:space="4" w:color="${o.borderTop.color}"/>` : ""}${o.borderBottom ? `<w:bottom w:val="single" w:sz="${o.borderBottom.size}" w:space="4" w:color="${o.borderBottom.color}"/>` : ""}</w:pBdr>`
    : "";
  const ppr = [
    o.keepNext ? "<w:keepNext/>" : "",
    bdr,
    o.tabRight ? `<w:tabs><w:tab w:val="right" w:pos="${o.tabRight}"/></w:tabs>` : "",
    `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 100}"${o.line ? ` w:line="${o.line}" w:lineRule="auto"` : ""}/>`,
    o.indentLeft || o.indentRight || o.hanging ? `<w:ind w:left="${o.indentLeft ?? 0}" w:right="${o.indentRight ?? 0}"${o.hanging ? ` w:hanging="${o.hanging}"` : ""}/>` : "",
    o.align ? `<w:jc w:val="${o.align === "left" ? "left" : o.align}"/>` : "",
  ].join("");
  return `<w:p><w:pPr>${ppr}</w:pPr>${content}</w:p>`;
}

const TAB = "<w:r><w:tab/></w:r>";

interface CellOpts {
  width: number;
  fill?: string | null;
  borders?: string;
  vAlign?: "center" | "top" | "bottom";
  margins?: { top?: number; bottom?: number; left?: number; right?: number };
}

function cell(content: string, o: CellOpts): string {
  const m = o.margins ?? {};
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${o.width}" w:type="dxa"/>` +
    (o.borders ? `<w:tcBorders>${o.borders}</w:tcBorders>` : "") +
    (o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : "") +
    `<w:tcMar><w:top w:w="${m.top ?? 70}" w:type="dxa"/><w:left w:w="${m.left ?? 110}" w:type="dxa"/><w:bottom w:w="${m.bottom ?? 70}" w:type="dxa"/><w:right w:w="${m.right ?? 110}" w:type="dxa"/></w:tcMar>` +
    `<w:vAlign w:val="${o.vAlign ?? "top"}"/></w:tcPr>${content || para("", { after: 0 })}</w:tc>`
  );
}

function tbl(rows: string[], widths: number[], o: { borders?: string; header?: boolean } = {}): string {
  const borders = o.borders ?? `<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>`
  );
}

const tr = (cells: string, o: { header?: boolean; height?: number; exact?: boolean; cantSplit?: boolean } = {}) =>
  `<w:tr><w:trPr>${o.cantSplit !== false ? "<w:cantSplit/>" : ""}${o.header ? "<w:tblHeader/>" : ""}${o.height ? `<w:trHeight w:val="${o.height}" w:hRule="${o.exact ? "exact" : "atLeast"}"/>` : ""}</w:trPr>${cells}</w:tr>`;

const bottomRule = `<w:bottom w:val="single" w:sz="4" w:color="${RULE}"/>`;
const spacer = (after = 120) => para("", { after, line: 120 });

function sectionHeading(n: number, title: string): string {
  return para(run(` ${n} `, { bold: true, color: "FFFFFF", shade: RED, size: 10 }) + run(`   ${title}`, { bold: true, caps: true, size: 12, color: INK }), {
    before: 260,
    after: 140,
    keepNext: true,
    borderBottom: { color: RULE, size: 4 },
  });
}

function chipRun(label: string, tone: Tone, size = 8): string {
  const t = TONE[tone];
  return run(` ${label} `, { bold: true, size, color: t.color, shade: t.fill ?? undefined });
}

function dataTable(headers: string[], rows: Array<Array<string | { chip: string; tone: Tone }>>, pct: number[]): string {
  const widths = pct.map((p) => Math.round((p / 100) * PAGE_W));
  const head = tr(headers.map((h, i) => cell(para(run(h, { bold: true, color: "FFFFFF", size: 8 }), { after: 0 }), { width: widths[i]!, fill: INK, vAlign: "center" })).join(""), { header: true });
  const body = rows.map((r, ri) =>
    tr(
      r
        .map((c, i) => {
          const fill = ri % 2 === 1 ? "F7F7F7" : null;
          if (typeof c !== "string" && c.chip === "—") return cell(para(run("—", { size: 8.5, color: MUTED }), { after: 0 }), { width: widths[i]!, fill, borders: bottomRule });
          if (typeof c !== "string") {
            const t = TONE[c.tone];
            return cell(para(run(c.chip, { bold: true, size: 8, color: t.color }), { after: 0 }), { width: widths[i]!, fill: t.fill ?? fill, vAlign: "center", borders: bottomRule });
          }
          return cell(para(run(c || "—", { size: 8.5, bold: i === 0, color: i === 0 ? INK : GREY }), { after: 0 }), { width: widths[i]!, fill, borders: bottomRule });
        })
        .join(""),
    ),
  );
  return tbl([head, ...body], widths) + spacer(160);
}

function barCell(value: number | null, width: number): string {
  if (value == null || value <= 0) return cell(para(run("—", { size: 8, color: MUTED }), { after: 0 }), { width, vAlign: "center" });
  const filled = Math.max(60, Math.round(((width - 220) * Math.min(value, 100)) / 100));
  const rest = width - 220 - filled;
  const inner = tbl([tr(cell(para(run(" ", { size: 2 }), { after: 0, line: 120 }), { width: filled, fill: RED, margins: { top: 0, bottom: 0, left: 0, right: 0 } }) + (rest > 0 ? cell(para(run(" ", { size: 2 }), { after: 0, line: 120 }), { width: rest, fill: TRACK, margins: { top: 0, bottom: 0, left: 0, right: 0 } }) : ""), { height: 150, exact: true })], rest > 0 ? [filled, rest] : [filled]);
  return cell(inner + para("", { after: 0, line: 120 }), { width, vAlign: "center", margins: { top: 90, bottom: 40, left: 0, right: 220 } });
}

function block(b: ReportBlock): string {
  switch (b.kind) {
    case "facts": {
      const rows = b.rows.filter(([, v]) => cleanText(v));
      const w = [1500, 3543, 1500, 3543];
      const out: string[] = [];
      for (let i = 0; i < rows.length; i += 2) {
        const pair = rows.slice(i, i + 2);
        out.push(
          tr(
            [0, 1]
              .map((k) => {
                const p = pair[k];
                return (
                  cell(para(run(p?.[0] ?? "", { bold: true, caps: true, size: 7, color: MUTED }), { after: 0 }), { width: w[k * 2]!, fill: p ? SOFT : null, borders: bottomRule, vAlign: "center" }) +
                  cell(para(run(p?.[1] ?? "", { size: 9.5 }), { after: 0 }), { width: w[k * 2 + 1]!, borders: bottomRule, vAlign: "center" })
                );
              })
              .join(""),
          ),
        );
      }
      return tbl(out, w) + spacer(160);
    }
    case "kpis": {
      const gap = 160;
      const n = b.items.length;
      const w = Math.floor((PAGE_W - gap * (n - 1)) / n);
      const cells: string[] = [];
      const widths: number[] = [];
      b.items.forEach((k, i) => {
        if (i > 0) {
          cells.push(cell("", { width: gap }));
          widths.push(gap);
        }
        cells.push(
          cell(
            para(run(k.label, { bold: true, caps: true, size: 7, color: GREY }), { after: 40 }) +
              para(run(k.value, { bold: true, size: 22, color: INK }), { after: 20 }) +
              (k.sub ? para(run(k.sub, { size: 7, color: MUTED }), { after: 0 }) : ""),
            { width: w, fill: SOFT, borders: `<w:left w:val="single" w:sz="24" w:color="${RED}"/>`, margins: { top: 120, bottom: 120, left: 180, right: 120 } },
          ),
        );
        widths.push(w);
      });
      return tbl([tr(cells.join(""))], widths) + spacer(180);
    }
    case "text":
      return cleanText(b.body)
        .split(/\n{2,}/)
        .map((p) => para(run(p, { size: 10 }), { after: 140, line: 288 }))
        .join("");
    case "list":
      return b.items.map((x) => para(run("■", { size: 6, color: RED }) + TAB + run(x, { size: 10 }), { after: 80, indentLeft: 300, hanging: 300, line: 276 })).join("") + spacer(80);
    case "timeline":
      return b.items
        .map(
          (it) =>
            para(run("● ", { size: 9, color: RED }) + run(it.title || "—", { bold: true, size: 10.5 }) + (it.period ? TAB + run(it.period, { size: 8.5, color: GREY }) : ""), { after: 20, keepNext: true, tabRight: PAGE_W }) +
            (it.subtitle ? para(run(it.subtitle, { size: 9, color: GREY }), { after: 60, indentLeft: 260, keepNext: it.bullets.length > 0 }) : "") +
            it.bullets.map((x) => para(run("–", { size: 9, color: MUTED }) + TAB + run(x, { size: 9.2, color: GREY }), { after: 30, indentLeft: 560, hanging: 260 })).join("") +
            spacer(100),
        )
        .join("");
    case "matrix":
      return dataTable(["Requisito", "Tipo", "Estado", "Evidencia u observación"], b.rows.map((r) => [r.requirement, r.type, { chip: r.status, tone: r.tone }, r.evidence || "—"]), [38, 14, 16, 32]);
    case "table":
      return dataTable(b.headers, b.rows, b.widths);
    case "bars": {
      const w = [3600, 4400, 2086];
      const rows = b.rows.map((r) =>
        tr(
          cell(para(run(r.label, { bold: true, size: 9 }), { after: r.note ? 10 : 0 }) + (r.note ? para(run(r.note, { size: 7, color: MUTED }), { after: 0 }) : ""), { width: w[0]!, vAlign: "center", margins: { top: 50, bottom: 50, left: 0, right: 120 } }) +
            barCell(r.value, w[1]!) +
            cell(para(run(r.display, { bold: true, size: 9 }), { after: 0 }), { width: w[2]!, vAlign: "center" }),
        ),
      );
      return tbl(rows, w) + (b.caption ? para(run(b.caption, { size: 7.5, color: MUTED, italic: true }), { before: 60, after: 160 }) : spacer(160));
    }
    case "recommendation":
      return (
        para(run("Recomendación del reclutador", { bold: true, caps: true, size: 7, color: MUTED }), { after: 60, keepNext: true }) +
        para(chipRun(b.label.toUpperCase(), b.tone, 11), { after: 200, keepNext: true }) +
        (cleanText(b.body) ? block({ kind: "text", body: b.body }) : "")
      );
  }
}

function headerXml(kicker: string, right: string): string {
  const w = [760, 5600, 3726];
  const content = tbl(
    [
      tr(
        cell(para(run("TPC", { bold: true, size: 12, color: "FFFFFF" }), { align: "center", after: 0 }), { width: w[0]!, fill: RED, vAlign: "center", margins: { top: 110, bottom: 110, left: 40, right: 40 } }) +
          cell(para(run("The People Outsourcing Company S.A.", { bold: true, size: 10.5, color: INK }), { after: 0 }) + para(run(kicker, { size: 8, color: GREY }), { after: 0 }), { width: w[1]!, vAlign: "center", margins: { left: 180 } }) +
          cell(para(run("CONFIDENCIAL", { bold: true, size: 8, color: RED, spacing: 20 }), { align: "right", after: 0 }) + para(run(right, { size: 8, color: GREY }), { align: "right", after: 0 }), { width: w[2]!, vAlign: "center" }),
      ),
    ],
    w,
  );
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    content +
    para("", { after: 0, borderBottom: { color: RULE, size: 4 }, line: 120 }) +
    `</w:hdr>`
  );
}

function footerXml(notice: string, meta: string): string {
  const field = (instr: string) =>
    `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>`;
  const w = [7600, 2486];
  const content = tbl(
    [
      tr(
        cell(para(run(notice, { italic: true, size: 6.8, color: MUTED }), { after: 0 }) + (meta ? para(run(meta, { size: 6.8, color: MUTED }), { after: 0 }) : ""), { width: w[0]!, margins: { left: 0, right: 120 } }) +
          cell(para(run("Página ", { bold: true, size: 8 }) + field("PAGE") + run(" de ", { bold: true, size: 8 }) + field("NUMPAGES"), { align: "right", after: 0 }), { width: w[1]!, vAlign: "top" }),
      ),
    ],
    w,
    { borders: `<w:top w:val="single" w:sz="4" w:color="${RULE}"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>` },
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${content}</w:ftr>`;
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:color w:val="${INK}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="es-CR"/></w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

function pack(body: string, title: string, header: string, footer: string): Uint8Array {
  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}` +
    `<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="12240" w:h="15840"/>` +
    `<w:pgMar w:top="1500" w:right="1077" w:bottom="1300" w:left="1077" w:header="500" w:footer="420" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
        `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
        `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    ),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `<Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>` +
        `<Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`,
    ),
    "docProps/core.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
        `<dc:title>${esc(title)}</dc:title><dc:creator>TPC Recruitment Hub</dc:creator></cp:coreProperties>`,
    ),
    "word/styles.xml": strToU8(STYLES),
    "word/header1.xml": strToU8(header),
    "word/footer1.xml": strToU8(footer),
    "word/document.xml": strToU8(document),
  };
  return zipSync(files, { level: 6 });
}

function cover(kicker: string, name: string, lines: string[], rec?: { label: string; tone: Tone }): string {
  const w = [6800, 3286];
  const left =
    para(run(kicker, { bold: true, caps: true, size: 7.5, color: RED, spacing: 10 }), { after: 60 }) +
    para(run(name, { bold: true, size: 22 }), { after: 60 }) +
    lines.map((l) => para(run(l, { size: 10.5, color: GREY }), { after: 20 })).join("");
  const right = rec ? para(run("Recomendación", { bold: true, caps: true, size: 7, color: MUTED }), { after: 60 }) + para(chipRun(rec.label.toUpperCase(), rec.tone, 9), { after: 0 }) : "";
  return tbl([tr(cell(left, { width: w[0]!, margins: { left: 0 } }) + cell(right, { width: w[1]!, vAlign: "bottom" }))], w) + para("", { before: 80, after: 160, indentRight: PAGE_W - 900, borderBottom: { color: RED, size: 18 }, line: 120 });
}

/** Documento Word (.docx, Office Open XML) generado sin servicios externos. */
export function buildReportDocx(m: ReportModel): Uint8Array {
  const body: string[] = [cover(m.title, m.candidateName, [m.subtitle, `Cliente: ${m.client}`], m.recommendation)];
  m.sections.forEach((s, i) => {
    body.push(sectionHeading(i + 1, s.title));
    for (const b of s.blocks) body.push(block(b));
  });
  return pack(
    body.join(""),
    `${m.title} · ${m.candidateName}`,
    headerXml("Informe ejecutivo de candidato", `Versión ${m.reportVersion} · ${m.finalizedAt}`),
    footerXml(m.footer, `Plantilla ${m.templateVersion}${m.finalizedBy ? ` · Elaborado por ${m.finalizedBy}` : ""}`),
  );
}

/** Informe comparativo de terna en Word. */
export function buildTernaDocx(t: TernaModel): Uint8Array {
  const body: string[] = [cover(t.title, t.vacancy, [`${t.position ? `${t.position} · ` : ""}Cliente: ${t.client}`])];
  body.push(sectionHeading(1, "Resumen de candidatos"));
  body.push(
    dataTable(
      ["Candidato(a)", "Puesto actual", "Experiencia", "Obligatorios", "Ponderado", "Recomendación"],
      t.candidates.map((x) => [x.name, x.currentTitle, x.years, x.mandatory, x.weighted != null ? `${String(x.weighted).replace(".", ",")} / 100` : "—", { chip: x.recommendation.label, tone: x.recommendation.tone }]),
      [21, 21, 12, 12, 13, 21],
    ),
  );
  let n = 2;
  if (t.candidates.some((x) => x.weighted != null)) {
    body.push(sectionHeading(n++, "Resultado ponderado de evaluaciones"));
    body.push(block({ kind: "bars", rows: t.candidates.map((x) => ({ label: x.name, value: x.weighted, display: x.weighted != null ? `${String(x.weighted).replace(".", ",")} / 100` : "Sin datos" })), caption: "Solo evaluaciones aplicables a la vacante. La comparación es informativa: la decisión es del cliente y del reclutador." }));
  }
  if (t.matrix.length) {
    body.push(sectionHeading(n++, "Matriz de cumplimiento comparada"));
    const reqPct = t.candidates.length > 4 ? 28 : 34;
    const each = (100 - reqPct) / t.candidates.length;
    body.push(dataTable(["Requisito", ...t.candidates.map((x) => x.name.split(" ").slice(0, 2).join(" "))], t.matrix.map((r) => [`${r.requirement} (${r.type.toLowerCase()})`, ...r.cells.map((c) => ({ chip: c.status, tone: c.tone }))]), [reqPct, ...t.candidates.map(() => each)]));
  }
  body.push(sectionHeading(n, "Fortalezas y aspectos por validar"));
  for (const x of t.candidates) {
    body.push(para(run(x.name, { bold: true, size: 10.5 }), { after: 60, keepNext: true }));
    const items = [...x.strengths.map((s) => `Fortaleza: ${s}`), ...x.toValidate.map((s) => `Por validar: ${s}`)];
    body.push(block({ kind: "list", items: items.length ? items : ["Sin información registrada en el informe."] }));
  }
  return pack(body.join(""), `${t.title} · ${t.vacancy}`, headerXml("Informe comparativo de terna", t.date), footerXml(t.footer, t.preparedBy ? `Elaborado por ${t.preparedBy}` : ""));
}
