import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildReportDocx, buildTernaDocx } from "@/lib/report/docx";
import { buildReportPdf, buildTernaPdf, pdfSafe } from "@/lib/report/pdf";
import { cleanText, reportFileName, toItems } from "@/lib/report/model";
import { composeReport, composeTerna } from "@/lib/report/compose";
import { SAMPLES } from "../../../tests/fixtures/report-samples";

const OUT = process.env.REPORT_SAMPLES_DIR;

describe("composición del informe ejecutivo v2", () => {
  it("13 apartados en orden y sin vacíos", () => {
    const m = composeReport(SAMPLES.tecnico);
    expect(m.sections.map((s) => s.title)).toEqual([
      "Información general",
      "Resumen ejecutivo",
      "Formación académica",
      "Trayectoria laboral relevante",
      "Matriz de cumplimiento",
      "Evidencias de la entrevista",
      "Evaluación de competencias",
      "Resultados de pruebas",
      "Casos prácticos",
      "Fortalezas",
      "Aspectos por validar",
      "Disponibilidad y condiciones laborales",
      "Conclusión y recomendación",
    ]);
  });
  it("oculta apartados sin información (sin casos prácticos ni perfil)", () => {
    const m = composeReport({ ...SAMPLES.operativo, cv: null, content: { ...SAMPLES.operativo.content, casos_practicos: "" } });
    const titles = m.sections.map((s) => s.title);
    expect(titles).not.toContain("Casos prácticos");
    expect(titles).not.toContain("Trayectoria laboral relevante");
    expect(titles).toContain("Matriz de cumplimiento");
  });
  it("competencias promedio por entrevista y criterios", () => {
    const m = composeReport(SAMPLES.administrativo);
    const bars = m.sections.find((s) => s.title === "Evaluación de competencias")!.blocks[0]!;
    expect(bars.kind === "bars" && bars.rows.find((r) => r.label === "Orientación al detalle")).toMatchObject({ display: "5 / 5", value: 100 });
  });
  it("las pruebas no aplicables no aparecen y la recomendación conserva el tono", () => {
    const m = composeReport(SAMPLES.comercial);
    expect(m.recommendation).toEqual({ label: "No recomendado", tone: "red" });
    expect(toItems("• uno\n- dos\n\n3) tres")).toEqual(["uno", "dos", "tres"]);
  });
});

describe("exportación PDF y Word", () => {
  for (const [kind, input] of Object.entries(SAMPLES)) {
    it(`perfil ${kind}: PDF y DOCX válidos`, async () => {
      const m = composeReport(input);
      const pdf = await buildReportPdf(m);
      expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
      const files = unzipSync(buildReportDocx(m));
      expect(Object.keys(files)).toEqual(expect.arrayContaining(["word/document.xml", "word/header1.xml", "word/footer1.xml", "word/styles.xml", "word/_rels/document.xml.rels"]));
      expect(strFromU8(files["word/footer1.xml"]!)).toContain("NUMPAGES");
      if (OUT) {
        mkdirSync(OUT, { recursive: true });
        writeFileSync(`${OUT}/informe-${kind}.pdf`, pdf);
        writeFileSync(`${OUT}/informe-${kind}.docx`, buildReportDocx(m));
      }
    });
  }
  it("terna comparativa", async () => {
    const t = composeTerna(
      { header: "", footer: SAMPLES.operativo.footer, title: "Informe comparativo de terna", vacancy: "Ejecutivo(a) comercial B2B", client: "Cliente Ficticio S.A.", position: "Ejecutivo de ventas", date: "26/11/2026", preparedBy: "Reclutadora Ficticia" },
      [SAMPLES.comercial, SAMPLES.administrativo, SAMPLES.tecnico].map((input) => ({ input })),
    );
    expect(t.candidates).toHaveLength(3);
    expect(t.matrix[0]!.cells).toHaveLength(3);
    const pdf = await buildTernaPdf(t);
    const docx = buildTernaDocx(t);
    expect(strFromU8(unzipSync(docx)["word/document.xml"]!)).toContain("Matriz de cumplimiento comparada");
    if (OUT) {
      writeFileSync(`${OUT}/terna.pdf`, pdf);
      writeFileSync(`${OUT}/terna.docx`, docx);
    }
  });
  it("contenido escapado y caracteres no soportados", async () => {
    const m = composeReport({ ...SAMPLES.operativo, candidate: { ...SAMPLES.operativo.candidate, name: "Ñandú Pérez <script>" } });
    const xml = strFromU8(unzipSync(buildReportDocx(m))["word/document.xml"]!);
    expect(xml).toContain("Ñandú Pérez &lt;script&gt;");
    expect(xml).not.toContain("<script>");
    expect(pdfSafe("Peña «x» ≥ 5 — ok")).toBe("Peña «x» ? 5 — ok");
  });
  it("pagina textos largos sin perder contenido", async () => {
    const long = composeReport({ ...SAMPLES.operativo, content: { ...SAMPLES.operativo.content, resumen_ejecutivo: "palabra ".repeat(4000) + "superlargasinespacios".repeat(20) } });
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(await buildReportPdf(long))).getPageCount()).toBeGreaterThan(3);
  });
  it("nombre de archivo seguro y texto limpio", () => {
    expect(reportFileName("José Ñandú / Pérez", 3, "pdf")).toBe("Informe-ejecutivo-Jose-Nandu-Perez-v3.pdf");
    expect(reportFileName("///", 1, "docx")).toBe("Informe-ejecutivo-candidato-v1.docx");
    expect(cleanText("a\u0000b\r\nc")).toBe("ab\nc");
  });
});

describe("plantillas publicadas por administración", () => {
  it("reconoce los apartados por el título aunque la clave cambie", () => {
    const m = composeReport({
      ...SAMPLES.operativo,
      templateSections: [
        { key: "resumen_ejecutivo", title: "Resumen ejecutivo" },
        { key: "fortalezas_destacadas", title: "Fortalezas destacadas" },
        { key: "observaciones_del_cliente", title: "Observaciones del cliente" },
      ],
      content: { resumen_ejecutivo: "Resumen", fortalezas_destacadas: "Una\nDos", observaciones_del_cliente: "Extra" },
    });
    const titles = m.sections.map((s) => s.title);
    expect(titles).toContain("Fortalezas");
    expect(titles).toContain("Observaciones del cliente");
    expect(titles.indexOf("Observaciones del cliente")).toBe(titles.length - 2);
  });
});
