import { describe, expect, it } from "vitest";
import { MARKERS, pseudonymize, reidentify } from "@/lib/ai/pseudonymize";
import { costUsd } from "@/lib/ai/pricing";

describe("seudonimización", () => {
  it("reemplaza nombre, correo, teléfono e identificación conocidos", () => {
    const text = "María José Núñez (maria.nunez@correo.test, tel. +506 8800-1234, cédula 1-0234-0567). Contactar a Maria Nunez.";
    const r = pseudonymize(text, { names: ["María José Núñez"], emails: ["maria.nunez@correo.test"], phones: ["88001234"], ids: ["102340567"] });
    expect(r.text).not.toMatch(/Mar[ií]a|N[uú][nñ]ez|correo\.test|8800|0234/);
    expect(r.text).toContain(MARKERS.name);
    expect(r.text).toContain(MARKERS.email);
    expect(r.text).toContain(MARKERS.phone);
    expect(r.text).toContain(MARKERS.id);
  });
  it("detecta patrones aunque no se conozcan los datos", () => {
    const r = pseudonymize("Escribir a otra.persona@empresa.test o al 2222-3333; perfil https://linkedin.com/in/alguien; id 112345678");
    expect(r.text).toBe(`Escribir a ${MARKERS.email} o al ${MARKERS.phone}; perfil ${MARKERS.url} id ${MARKERS.id}`);
  });
  it("no altera texto sin datos personales ni cifras de experiencia", () => {
    const t = "5 años de experiencia en ventas corporativas, manejo de Excel avanzado y SAP.";
    expect(pseudonymize(t).text).toBe(t);
  });
  it("revierte solo el nombre", () => {
    expect(reidentify(`${MARKERS.name} es recomendable. ${MARKERS.email}`, "Ana")).toBe(`Ana es recomendable. ${MARKERS.email}`);
  });
});

describe("costos", () => {
  it("calcula con el precio del modelo", () => {
    expect(costUsd("claude-opus-5-5", 1_000_000, 100_000)).toBe(6);
    expect(costUsd("claude-haiku-5-5", 10_000, 1_000)).toBe(0.0015);
  });
  it("modelo desconocido: estimación conservadora", () => {
    expect(costUsd("otro", 1_000_000, 0)).toBe(5);
  });
});

import { SCHEMAS, simulate } from "@/lib/ai/features";

describe("proveedor simulado", () => {
  it("cumple el esquema de cada función", () => {
    const reqs = [
      { name: "Excel avanzado", type: "obligatorio", status: "cumple" },
      { name: "Inglés B2", type: "deseable", status: "pendiente" },
      { name: "Licencia B1", type: "obligatorio", status: "no_cumple" },
    ];
    expect(SCHEMAS.comparar.parse(simulate("comparar", { requirements: reqs })).puntaje).toBe(33);
    expect(SCHEMAS.preguntas.parse(simulate("preguntas", { requirements: reqs, vacancyTitle: "Analista" })).preguntas.length).toBe(5);
    expect(SCHEMAS.publicacion.parse(simulate("publicacion", { vacancyTitle: "Analista", requirements: reqs })).titulo).toContain("Analista");
    expect(SCHEMAS.borrador_informe.parse(simulate("borrador_informe", { sections: [{ key: "perfil", title: "Perfil" }], facts: ["Excel: Aprobada"] })).secciones[0]!.clave).toBe("perfil");
    const cv = SCHEMAS.extraer_cv.parse(simulate("extraer_cv", { text: "Experiencia laboral\nEjecutiva de ventas - Empresa Ficticia S.A.\nEne 2018 - Dic 2024\n• Gestión de cartera\nIdiomas\nInglés B2" }));
    expect(cv).toMatchObject({ puesto_actual: "Ejecutiva de ventas", anios_experiencia: 7, idiomas: [{ idioma: "Inglés", nivel: "B2" }] });
  });
});

describe("seudonimización y períodos laborales", () => {
  it("conserva rangos de años pero reemplaza teléfonos", () => {
    expect(pseudonymize("Analista 2015-2019, tel. 2222-3333").text).toBe(`Analista 2015-2019, tel. ${MARKERS.phone}`);
  });
});

import { parseCvText } from "@/lib/cv/parse";
import { readFileSync } from "node:fs";
import { discriminatoryReason, screenQuestions } from "@/lib/ai/guardrails";

describe("preselección, guion y conclusiones simulados", () => {
  const profile = parseCvText(readFileSync("tests/fixtures/cv/administrativo.txt", "utf8"));
  const reqs = [
    { name: "Excel avanzado", type: "obligatorio" },
    { name: "Inglés B2", type: "deseable" },
    { name: "3 años de experiencia", type: "obligatorio" },
    { name: "Licencia de conducir B1", type: "obligatorio" },
    { name: "Facturación electrónica", type: "deseable", status: "cumple" },
    { name: "Disponibilidad para viajar", type: "deseable", status: "no_cumple" },
  ];
  it("matriz con los cuatro estados, sin incumplimientos por falta de datos", () => {
    const r = SCHEMAS.preseleccion.parse(simulate("preseleccion", { requirements: reqs, profile }));
    const by = Object.fromEntries(r.matriz.map((m) => [m.requisito, m.estado]));
    expect(by).toEqual({
      "Excel avanzado": "confirmado",
      "Inglés B2": "parcial",
      "3 años de experiencia": "confirmado",
      "Licencia de conducir B1": "insuficiente",
      "Facturación electrónica": "confirmado",
      "Disponibilidad para viajar": "incumplido",
    });
    expect(r.matriz.find((m) => m.requisito === "Excel avanzado")!.evidencia).toMatch(/Excel avanzado/);
    expect(r.explorar_en_entrevista.length).toBeGreaterThan(0);
    expect(r.resumen).not.toMatch(/descart|contrat/i);
  });
  it("sin perfil: todo queda como información insuficiente", () => {
    const r = simulate("preseleccion", { requirements: [{ name: "Excel", type: "obligatorio" }] });
    expect(r.matriz[0]!.estado).toBe("insuficiente");
  });
  it("guion personalizado basado en el CV y sin temas prohibidos", () => {
    const r = SCHEMAS.preguntas_entrevista.parse(simulate("preguntas_entrevista", { requirements: reqs, profile, vacancyTitle: "Asistente contable", pending: ["Verificar nivel de inglés"] }));
    expect(r.preguntas[0]!.texto).toMatch(/Asistente administrativa/);
    expect(r.preguntas.some((q) => /30%/.test(q.texto))).toBe(true);
    expect(r.preguntas.every((q) => discriminatoryReason(q.texto) === null)).toBe(true);
  });
  it("conclusiones solo con lo registrado", () => {
    const r = SCHEMAS.conclusiones_entrevista.parse(simulate("conclusiones_entrevista", { answers: [
      { question: "Logro", competency: "Resultados", notes: "Redujo atrasos 30% con control en Excel", rating: 5 },
      { question: "Inglés", competency: "Idioma", notes: "", rating: null },
    ] }));
    expect(r.evidencias).toEqual(["Resultados: Redujo atrasos 30% con control en Excel"]);
    expect(r.aspectos_por_validar).toEqual(["Sin respuesta registrada: Inglés"]);
  });
});

describe("salvaguardas de preguntas", () => {
  it("bloquea temas discriminatorios", () => {
    for (const q of ["¿Está casada?", "¿Tiene hijos pequeños?", "¿Qué religión practica?", "¿Cuántos años tiene?", "¿Padece alguna enfermedad?", "¿Planea quedar embarazada?"]) {
      expect(discriminatoryReason(q), q).not.toBeNull();
    }
    expect(discriminatoryReason("¿Cómo priorizó sus tareas en el cierre contable?")).toBeNull();
    expect(discriminatoryReason("¿Cuántos años de experiencia tiene en ventas?")).toBeNull();
  });
  it("omite repetidas y discriminatorias", () => {
    const r = screenQuestions([{ texto: "¿Cómo maneja Excel?" }, { texto: "¿como maneja excel" }, { texto: "¿Tiene hijos?" }, { texto: "Describa un logro." }], ["Describa un logro"]);
    expect(r.kept.map((q) => q.texto)).toEqual(["¿Cómo maneja Excel?"]);
    expect(r.removed).toHaveLength(3);
  });
});

describe("seudonimización de apellidos que son palabras comunes", () => {
  it("no borra palabras comunes en minúscula, sí el nombre escrito como nombre", () => {
    const r = pseudonymize("LUCÍA CONTABLE\nAsistente contable con experiencia. Contable, Lucía. Mora en pagos: ninguna.", { names: ["Lucía Contable"] });
    expect(r.text).toBe(`${MARKERS.name}\nAsistente contable con experiencia. ${MARKERS.name}, ${MARKERS.name}. Mora en pagos: ninguna.`);
  });
});
