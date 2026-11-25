import { describe, expect, it } from "vitest";
import { assessmentTypeSchema, credentialSchema, crLocalToIso, interviewResultSchema, isoToCrLocal, parseTemplateSections } from "@/modules/evaluations/schema";

describe("fase 4: validaciones", () => {
  it("convierte la hora de Costa Rica (UTC−6) sin desfases", () => {
    expect(crLocalToIso("2026-12-01T09:30")).toBe("2026-12-01T15:30:00.000Z");
    expect(isoToCrLocal("2026-12-01T15:30:00.000Z")).toBe("2026-12-01T09:30");
    expect(crLocalToIso("ayer")).toBeNull();
  });
  it("una entrevista realizada exige recomendación", () => {
    const id = "11111111-0000-4000-8000-000000000001";
    expect(interviewResultSchema.safeParse({ id, status: "realizada" }).success).toBe(false);
    expect(interviewResultSchema.parse({ id, status: "realizada", recommendation: "recomendado", rating: "4" }).rating).toBe(4);
    expect(interviewResultSchema.parse({ id, status: "cancelada" }).recommendation).toBeNull();
  });
  it("puntajes coherentes en los tipos de evaluación", () => {
    expect(assessmentTypeSchema.safeParse({ name: "Excel", pass_score: "70" }).success).toBe(false);
    expect(assessmentTypeSchema.safeParse({ name: "Excel", max_score: "100", pass_score: "120" }).success).toBe(false);
    expect(assessmentTypeSchema.parse({ name: "Excel", max_score: "100", pass_score: "70" }).pass_score).toBe(70);
  });
  it("credenciales: el vencimiento no precede a la emisión", () => {
    const base = { candidate_id: "11111111-0000-4000-8000-000000000001", credential_type_id: "11111111-0000-4000-8000-000000000002" };
    expect(credentialSchema.safeParse({ ...base, issued_on: "2026-05-01", expires_on: "2026-04-01" }).success).toBe(false);
    expect(credentialSchema.parse({ ...base, verified: "on" }).verified).toBe(true);
  });
  it("secciones de la plantilla: una por línea con claves únicas", () => {
    expect(parseTemplateSections("Perfil del candidato | Formación\nPerfil del candidato\n\nRecomendación")).toEqual([
      { key: "perfil_del_candidato", title: "Perfil del candidato", help: "Formación" },
      { key: "perfil_del_candidato_2", title: "Perfil del candidato", help: "" },
      { key: "recomendacion", title: "Recomendación", help: "" },
    ]);
  });
});
