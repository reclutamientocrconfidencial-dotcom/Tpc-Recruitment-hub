import { describe, expect, it } from "vitest";
import { channelCode, parseStagesJson, requirementSchema } from "@/modules/config/schema";

const valid = [
  { name: "Recibido", category: "nuevo", stage_type: "general", target_days: "2" },
  { name: "Entrevista", category: "en_proceso", stage_type: "entrevista", target_days: "" },
  { name: "Contratado", category: "contratado", stage_type: "general", target_days: "" },
  { name: "Descartado", category: "descartado", stage_type: "general", target_days: "" },
];

describe("etapas del proceso", () => {
  it("acepta un proceso válido", () => {
    const r = parseStagesJson(JSON.stringify(valid));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data[0]?.target_days).toBe(2);
  });
  it("exige nuevo, contratado y descartado", () => {
    const r = parseStagesJson(JSON.stringify(valid.filter((s) => s.category !== "descartado")));
    expect(r.success).toBe(false);
  });
  it("rechaza nombres repetidos, JSON inválido y plazos fuera de rango", () => {
    expect(parseStagesJson(JSON.stringify([...valid, { ...valid[1], name: "entrevista" }])).success).toBe(false);
    expect(parseStagesJson("{no-json").success).toBe(false);
    expect(parseStagesJson(JSON.stringify([{ ...valid[0], target_days: "999" }, ...valid.slice(1)])).success).toBe(false);
  });
});

describe("requisitos y fuentes", () => {
  it("valida requisitos", () => {
    expect(requirementSchema.safeParse({ position_title: "", requirement: "Inglés B2", requirement_type: "obligatorio", category: "idioma", expected_level: "B2", weight: "4" }).success).toBe(true);
    expect(requirementSchema.safeParse({ position_title: "", requirement: "x", requirement_type: "obligatorio", category: "idioma", expected_level: "", weight: "9" }).success).toBe(false);
  });
  it("genera códigos de fuente seguros", () => {
    expect(channelCode("Feria Empleo San José 2026")).toBe("feria_empleo_san_jose_2026");
    expect(channelCode("¡¡!!")).toBe("fuente");
  });
});
