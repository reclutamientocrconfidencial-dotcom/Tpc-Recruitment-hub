import { describe, expect, it } from "vitest";
import { botCheck, extractAnswers, meetsQuestion, publicLinkUrl, publicSubmissionSchema, questionSchema, linkCodeSchema, MIN_FILL_MS } from "@/modules/intake/schema";

const base = {
  first_name: " Nora ",
  last_name: "Ficticia",
  email: "NORA@correo.test",
  phone: "",
  consent: "on",
  consent_text_id: "11111111-0000-4000-8000-000000000001",
};

describe("formulario público", () => {
  it("acepta datos mínimos y normaliza", () => {
    const r = publicSubmissionSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data?.first_name).toBe("Nora");
    expect(r.data?.email).toBe("nora@correo.test");
  });
  it("exige consentimiento", () => {
    const r = publicSubmissionSchema.safeParse({ ...base, consent: undefined });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/consentimiento/);
  });
  it("exige al menos un medio de contacto", () => {
    const r = publicSubmissionSchema.safeParse({ ...base, email: "", phone: "" });
    expect(r.error?.issues[0]?.message).toMatch(/correo o un teléfono/);
  });
  it("normaliza el teléfono y rechaza provincias inventadas", () => {
    expect(publicSubmissionSchema.parse({ ...base, phone: "88880101" }).phone).toBe("+506 8888-0101");
    expect(publicSubmissionSchema.safeParse({ ...base, province: "Narnia" }).success).toBe(false);
  });
});

describe("preguntas de preselección", () => {
  const qs = [
    { id: "a", label: "Licencia", kind: "si_no" as const, options: [], required: true },
    { id: "b", label: "Turno", kind: "opcion" as const, options: ["Diurno", "Nocturno"], required: false },
    { id: "c", label: "Años", kind: "numero" as const, options: [], required: true },
  ];
  const fd = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  it("extrae respuestas válidas", () => {
    expect(extractAnswers(fd({ q_a: "si", q_b: "Diurno", q_c: "3" }), qs)).toEqual({ answers: { a: "si", b: "Diurno", c: "3" }, errors: {} });
  });
  it("marca obligatorias vacías y respuestas fuera de opciones", () => {
    const r = extractAnswers(fd({ q_b: "Mixto", q_c: "tres" }), qs);
    expect(Object.keys(r.errors).sort()).toEqual(["q_a", "q_b", "q_c"]);
  });
  it("evalúa el criterio eliminatorio como la BD", () => {
    expect(meetsQuestion({ expected_answer: "si", min_number: null }, "si")).toBe(true);
    expect(meetsQuestion({ expected_answer: "si", min_number: null }, "no")).toBe(false);
    expect(meetsQuestion({ expected_answer: null, min_number: 2 }, "1")).toBe(false);
    expect(meetsQuestion({ expected_answer: null, min_number: 2 }, "2.5")).toBe(true);
    expect(meetsQuestion({ expected_answer: null, min_number: null }, "x")).toBeNull();
  });
  it("valida la configuración de preguntas", () => {
    const form_id = "11111111-0000-4000-8000-000000000001";
    expect(questionSchema.safeParse({ form_id, label: "Turno", kind: "opcion", options: "Diurno" }).success).toBe(false);
    expect(questionSchema.parse({ form_id, label: "Turno", kind: "opcion", options: "Diurno\nNocturno", expected_answer: "Diurno" }).options).toEqual(["Diurno", "Nocturno"]);
    expect(questionSchema.safeParse({ form_id, label: "Turno", kind: "opcion", options: "Diurno\nNocturno", expected_answer: "Mixto" }).success).toBe(false);
    expect(questionSchema.safeParse({ form_id, label: "Años", kind: "texto", min_number: "2" }).success).toBe(false);
    expect(questionSchema.parse({ form_id, label: "Años", kind: "numero", min_number: "2" }).min_number).toBe(2);
  });
});

describe("anti-robots y enlaces", () => {
  it("rechaza el campo trampa y envíos instantáneos", () => {
    const now = 1_800_000_000_000;
    expect(botCheck("http://spam", String(now - 60_000), now)).toBe("bot");
    expect(botCheck("", String(now - MIN_FILL_MS + 1), now)).toBe("bot");
    expect(botCheck("", String(now - 60_000), now)).toBeNull();
    expect(botCheck("", "x", now)).toMatch(/Recargue/);
    expect(botCheck("", String(now - 7 * 3600_000), now)).toMatch(/caducó/);
  });
  it("valida códigos y arma la URL pública", () => {
    expect(linkCodeSchema.safeParse("FeriaFicticia01").data).toBe("feriaficticia01");
    expect(linkCodeSchema.safeParse("../admin").success).toBe(false);
    expect(publicLinkUrl("https://tpc.example/", "abc12345")).toBe("https://tpc.example/p/abc12345");
  });
});
