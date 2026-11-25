import { describe, expect, it } from "vitest";
import { channelCode, parseStagesJson, requirementSchema } from "@/modules/config/schema";
import { positionSchema, scaleSchema, stageCatalogSchema, requirementCatalogSchema } from "@/modules/catalogs/schema";

const U = (n: number) => `99999999-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("etapas del proceso (catálogo)", () => {
  it("acepta etapas del catálogo con plazo opcional", () => {
    const r = parseStagesJson(JSON.stringify([
      { catalog_stage_id: U(1), target_days: "2" },
      { catalog_stage_id: U(6), target_days: "" },
      { catalog_stage_id: U(12) },
      { catalog_stage_id: U(13) },
    ]));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.map((s) => s.target_days)).toEqual([2, null, null, null]);
  });
  it("mantiene el formato anterior (nombre + categoría) por compatibilidad", () => {
    const r = parseStagesJson(JSON.stringify([
      { name: "Recibido", category: "nuevo" },
      { name: "Contratado", category: "contratado" },
      { name: "Descartado", category: "descartado" },
    ]));
    expect(r.success).toBe(true);
  });
  it("rechaza filas sin etapa, etapas repetidas, JSON inválido y menos de 3 etapas", () => {
    expect(parseStagesJson(JSON.stringify([{ catalog_stage_id: "" }, { catalog_stage_id: U(1) }, { catalog_stage_id: U(2) }])).success).toBe(false);
    expect(parseStagesJson(JSON.stringify([{ catalog_stage_id: U(1) }, { catalog_stage_id: U(1) }, { catalog_stage_id: U(2) }])).success).toBe(false);
    expect(parseStagesJson("{no-json").success).toBe(false);
    expect(parseStagesJson(JSON.stringify([{ catalog_stage_id: U(1) }])).success).toBe(false);
    expect(parseStagesJson(JSON.stringify([{ catalog_stage_id: U(1), target_days: "999" }, { catalog_stage_id: U(2) }, { catalog_stage_id: U(3) }])).success).toBe(false);
  });
});

describe("requisitos de plantilla", () => {
  const base = { catalog_requirement_id: U(1), catalog_requirement_id_new: "", position_id: "", position_id_new: "", min_level_id: U(2), requirement_type: "obligatorio", weight: "4" };
  it("acepta requisito del catálogo con nivel y sin puesto", () => {
    const r = requirementSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ position_id: null, min_level_id: U(2), weight: 4 });
  });
  it("acepta un requisito nuevo escrito libremente (sin campo de nivel)", () => {
    const { min_level_id: _omit, ...rest } = base;
    void _omit;
    const r = requirementSchema.safeParse({ ...rest, catalog_requirement_id: "", catalog_requirement_id_new: "Power BI", new_category: "habilidad" });
    expect(r.success).toBe(true);
  });
  it("exige requisito y valida el peso", () => {
    expect(requirementSchema.safeParse({ ...base, catalog_requirement_id: "" }).success).toBe(false);
    expect(requirementSchema.safeParse({ ...base, weight: "9" }).success).toBe(false);
    expect(requirementSchema.safeParse({ ...base, min_level_id: "no-uuid" }).success).toBe(false);
  });
  it("genera códigos de fuente seguros", () => {
    expect(channelCode("Feria Empleo San José 2026")).toBe("feria_empleo_san_jose_2026");
    expect(channelCode("¡¡!!")).toBe("fuente");
  });
});

describe("catálogos", () => {
  it("los campos opcionales pueden faltar en el formulario", () => {
    expect(stageCatalogSchema.safeParse({ name: "Evaluación psicométrica", category: "en_proceso", stage_type: "prueba" }).success).toBe(true);
    expect(requirementCatalogSchema.safeParse({ name: "Power BI", category: "habilidad" }).success).toBe(true);
    expect(positionSchema.safeParse({ name: "Supervisor(a)" }).success).toBe(true);
  });
  it("etapa del catálogo", () => {
    expect(stageCatalogSchema.safeParse({ name: "Evaluación psicométrica", category: "en_proceso", stage_type: "prueba", default_target_days: "2", description: "" }).success).toBe(true);
    expect(stageCatalogSchema.safeParse({ name: "X", category: "otra", stage_type: "prueba", default_target_days: "", description: "" }).success).toBe(false);
  });
  it("puesto y requisito", () => {
    expect(positionSchema.safeParse({ name: "Supervisor(a) de bodega", area: "", description: "" }).data).toMatchObject({ area: null });
    expect(requirementCatalogSchema.safeParse({ name: "Power BI", category: "habilidad", scale_id: "", description: "" }).data).toMatchObject({ scale_id: null });
  });
  it("escala: niveles uno por línea, sin repetidos", () => {
    const r = scaleSchema.safeParse({ name: "Nivel de SAP", description: "", levels: "Usuario\n  Usuario clave \n\nConsultor" });
    expect(r.data?.levels).toEqual(["Usuario", "Usuario clave", "Consultor"]);
    expect(scaleSchema.safeParse({ name: "X escala", description: "", levels: "A\na" }).success).toBe(false);
    expect(scaleSchema.safeParse({ name: "X escala", description: "", levels: "   " }).success).toBe(false);
  });
});
