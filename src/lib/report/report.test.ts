import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildReportDocx } from "@/lib/report/docx";
import { buildReportPdf, pdfSafe } from "@/lib/report/pdf";
import { cleanText, reportFileName, type ReportModel } from "@/lib/report/model";

const model: ReportModel = {
  header: "The People Outsourcing Company S.A. · Informe ejecutivo",
  footer: "Documento confidencial (Ley 8968).",
  templateVersion: "2026-1",
  title: "Informe ejecutivo de candidato",
  candidateName: "Ñandú Pérez <script>",
  vacancy: "VAC-2026-00001 · Ejecutivo(a) de ventas",
  client: "Cliente Ficticio S.A.",
  position: "Ejecutivo(a) de ventas",
  reportVersion: 2,
  finalizedAt: "25/11/2026",
  finalizedBy: "Coordinadora Ficticia",
  recommendation: "Recomendado",
  assessments: [{ name: "Prueba de Excel", requirement: "Obligatoria", result: "Aprobada", detail: "85 de 100" }],
  interviews: [{ date: "24/11/2026", kind: "Virtual", interviewer: "Reclutador Ficticio", recommendation: "Recomendado" }],
  sections: [
    { title: "Perfil", body: "Línea 1\nLínea 2 con «comillas» y ≥ símbolo" },
    { title: "Vacía", body: "   " },
  ],
};

describe("informe ejecutivo", () => {
  it("genera un .docx válido con el contenido escapado", () => {
    const files = unzipSync(buildReportDocx(model));
    expect(Object.keys(files).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "docProps/core.xml", "word/document.xml"]);
    const xml = strFromU8(files["word/document.xml"]!);
    expect(xml).toContain("Ñandú Pérez &lt;script&gt;");
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("Prueba de Excel");
    expect(xml).toContain("<w:br/>");
    expect(xml).not.toContain("Vacía"); // secciones vacías se omiten
  });
  it("genera un PDF y reemplaza caracteres no soportados", async () => {
    const pdf = await buildReportPdf(model);
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
    expect(pdfSafe("Peña «x» ≥ 5 — ok")).toBe("Peña «x» ? 5 — ok");
  });
  it("pagina textos largos sin perder contenido", async () => {
    const long = { ...model, sections: [{ title: "Largo", body: "palabra ".repeat(4000) + "superlargasinespacios".repeat(20) }] };
    const pdf = await buildReportPdf(long);
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(2);
  });
  it("nombre de archivo seguro y texto limpio", () => {
    expect(reportFileName("José Ñandú / Pérez", 3, "pdf")).toBe("Informe-ejecutivo-Jose-Nandu-Perez-v3.pdf");
    expect(reportFileName("///", 1, "docx")).toBe("Informe-ejecutivo-candidato-v1.docx");
    expect(cleanText("a\u0000b\r\nc")).toBe("ab\nc");
  });
});
