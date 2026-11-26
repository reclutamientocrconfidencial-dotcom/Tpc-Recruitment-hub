import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { parseCvText, totalYears } from "@/lib/cv/parse";
import { assessQuality, extractCvText, extractDocxText } from "@/lib/cv/extract-text";
import { extractPdfText } from "@/lib/cv/extract-pdf";
import { normalizeProfile, cvProfileSchema } from "@/lib/cv/profile";
import { pseudonymize } from "@/lib/ai/pseudonymize";

const cv = (name: string) => readFileSync(`tests/fixtures/cv/${name}.txt`, "utf8");

describe("analizador de currículums", () => {
  it("perfil operativo: experiencia, licencias, idiomas y años", () => {
    const p = parseCvText(cv("operativo"));
    expect(p.experiencia).toHaveLength(2);
    expect(p.experiencia[0]).toMatchObject({ cargo: "Operario de bodega", empresa: "Distribuidora Ficticia del Valle S.A.", desde: "Mar 2020" });
    expect(p.experiencia[0]!.logros[0]).toMatch(/15%/);
    expect(p.experiencia[0]!.funciones).toHaveLength(2);
    expect(p.puesto_actual).toBe("Operario de bodega");
    expect(p.licencias.join(" ")).toMatch(/B1/);
    expect(p.idiomas).toEqual(expect.arrayContaining([{ idioma: "Inglés", nivel: "A1" }]));
    expect(p.anios_experiencia).toBeGreaterThan(8);
    expect(p.formacion.length).toBe(2);
  });
  it("perfil administrativo: periodo entre paréntesis y nivel B1", () => {
    const p = parseCvText(cv("administrativo"));
    expect(p.experiencia[0]).toMatchObject({ cargo: "Asistente administrativa", empresa: "Servicios Contables Ficticios S.A.", hasta: "Presente" });
    expect(p.experiencia[0]!.logros[0]).toMatch(/30%/);
    expect(p.idiomas).toContainEqual({ idioma: "Inglés", nivel: "B1" });
    expect(p.habilidades.join(" ")).toMatch(/Excel avanzado/);
    expect(p.certificaciones[0]).toMatch(/Facturación electrónica/);
  });
  it("perfiles técnico y comercial", () => {
    const t = parseCvText(cv("tecnico"));
    expect(t.experiencia[0]!.cargo).toBe("Técnico de mantenimiento");
    expect(t.certificaciones).toHaveLength(2);
    const c = parseCvText(cv("comercial"));
    expect(c.experiencia[0]).toMatchObject({ cargo: "Ejecutiva de cuentas corporativas", empresa: "Soluciones Ficticias Empresariales S.A." });
    expect(c.idiomas).toEqual(expect.arrayContaining([{ idioma: "Inglés", nivel: "C1" }, { idioma: "Portugués", nivel: "A1" }]));
  });
  it("funciona sobre el texto seudonimizado (sin datos personales)", () => {
    const safe = pseudonymize(cv("comercial"), { names: ["Sofía Elena Jiménez Ficticia"], emails: ["sofia.jimenez@correo.test"], phones: ["88003404"] }).text;
    expect(safe).not.toMatch(/sofia|Sofía|8800-3404/i);
    const p = parseCvText(safe);
    expect(cvProfileSchema.parse(p).experiencia.length).toBe(2);
  });
  it("años sin duplicar períodos superpuestos", () => {
    expect(totalYears([{ desde: "Ene 2020", hasta: "Dic 2021" }, { desde: "Jun 2021", hasta: "Dic 2022" }])).toBe(3);
    expect(totalYears([{ desde: "2010", hasta: "texto" }])).toBe(0);
  });
});

describe("lectura de archivos", () => {
  it("Word: párrafos y entidades", () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>Experiencia laboral</w:t></w:r></w:p><w:p><w:r><w:t>Analista &amp; Coordinadora</w:t></w:r></w:p></w:body></w:document>';
    expect(extractDocxText(zipSync({ "word/document.xml": strToU8(xml) }))).toBe("Experiencia laboral\nAnalista & Coordinadora");
  });
  it("PDF con texto y detección de escaneado", async () => {
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage();
    cv("tecnico").split("\n").slice(4, 20).forEach((l, i) => page.drawText(l.replace(/[•—]/g, "-"), { x: 40, y: 760 - i * 14, size: 10, font }));
    const r = await extractPdfText(await doc.save());
    expect(assessQuality(r.text, r.pages).quality).toBe("legible");
    expect(r.text).toMatch(/Técnico de mantenimiento/);
    const scanned = await PDFDocument.create();
    scanned.addPage();
    const s = await extractPdfText(await scanned.save());
    const q = assessQuality(s.text, s.pages);
    expect(q.quality).toBe("ilegible");
    expect(q.note).toMatch(/escaneado/);
    // En el servidor un PDF sin texto del navegador queda como no legible (no se envía a IA)
    expect((await extractCvText(await doc.save(), "application/pdf")).quality).toBe("ilegible");
  });
  it("calidad parcial con caracteres ilegibles", () => {
    expect(assessQuality("�".repeat(50) + " texto ".repeat(40), 1).quality).toBe("parcial");
  });
  it("normaliza perfiles incompletos sin fallar", () => {
    expect(normalizeProfile({ anios_experiencia: "x", experiencia: [{ cargo: "A" }, "malo"] })).toMatchObject({ anios_experiencia: 0, experiencia: [{ cargo: "A", empresa: "", funciones: [] }] });
  });
});

describe("idiomas con caracteres especiales", () => {
  it("detecta Español nativo", () => {
    expect(parseCvText(cv("operativo")).idiomas).toEqual(expect.arrayContaining([{ idioma: "Español", nivel: "C2" }]));
  });
});
