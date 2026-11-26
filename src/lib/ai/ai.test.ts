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
    const cv = SCHEMAS.extraer_cv.parse(simulate("extraer_cv", { text: "Ejecutiva de ventas\n7 años en ventas, Excel y SAP. Inglés nivel B2. Bachiller en Administración." }));
    expect(cv).toMatchObject({ puesto_actual: "Ejecutiva de ventas", anios_experiencia: 7, idiomas: [{ idioma: "Inglés", nivel: "B2" }] });
    expect(cv.habilidades).toEqual(expect.arrayContaining(["Excel", "SAP", "ventas"]));
  });
});
