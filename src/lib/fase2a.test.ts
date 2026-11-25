import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizeLegalId, normalizePhone, phoneE164 } from "@/lib/normalize";
import { pageRange, paginateArray, parsePage, totalPages } from "@/lib/pagination";
import { hrefWith, oneOf, param, sanitizeSearch } from "@/lib/search-params";
import { dbErrorMessage } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";
import { can } from "@/lib/auth/permissions";

describe("normalización", () => {
  it("cédula jurídica de 10 dígitos al formato oficial", () => {
    expect(normalizeLegalId("3101123456")).toBe("3-101-123456");
    expect(normalizeLegalId(" 3-101-123456 ")).toBe("3-101-123456");
    expect(normalizeLegalId("3 101 123456")).toBe("3-101-123456");
    expect(normalizeLegalId("ab-12 34")).toBe("AB-1234");
    expect(normalizeLegalId("")).toBe("");
  });
  it("teléfonos de Costa Rica", () => {
    expect(normalizePhone("22223333")).toBe("+506 2222-3333");
    expect(normalizePhone("+506 8888-7777")).toBe("+506 8888-7777");
    expect(phoneE164("8888 7777")).toBe("+50688887777");
    expect(phoneE164("+1 (555) 010-0000")).toBe("+15550100000");
  });
  it("correo en minúsculas", () => {
    expect(normalizeEmail("  Ana@Correo.TEST ")).toBe("ana@correo.test");
  });
});

describe("paginación", () => {
  it("parsea páginas inválidas como 1", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("-3")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("4")).toBe(4);
    expect(parsePage("99999999")).toBe(10000);
  });
  it("rangos y totales", () => {
    expect(pageRange(1)).toEqual([0, 24]);
    expect(pageRange(3)).toEqual([50, 74]);
    expect(totalPages(0)).toBe(1);
    expect(totalPages(26)).toBe(2);
  });
  it("pagina arreglos en memoria", () => {
    const rows = Array.from({ length: 30 }, (_, i) => i);
    const p2 = paginateArray(rows, 2);
    expect(p2.rows).toEqual([25, 26, 27, 28, 29]);
    expect(p2.total).toBe(30);
  });
});

describe("parámetros de búsqueda", () => {
  it("limpia caracteres especiales de PostgREST", () => {
    expect(sanitizeSearch("abc,def(1)*%")).toBe("abc def 1");
    expect(sanitizeSearch("name.eq.x,or(1)")).toBe("name.eq.x or 1");
    expect(sanitizeSearch("a".repeat(200))).toHaveLength(80);
  });
  it("lee el primer valor y valida listas cerradas", () => {
    expect(param({ q: ["  hola ", "x"] }, "q")).toBe("hola");
    expect(oneOf("activo", ["activo", "inactivo"] as const)).toBe("activo");
    expect(oneOf("borrar", ["activo", "inactivo"] as const)).toBe("");
  });
  it("construye URLs conservando filtros", () => {
    expect(hrefWith("/clientes", { q: "ana", estado: "" }, { page: 2 })).toBe("/clientes?q=ana&page=2");
    expect(hrefWith("/clientes", { q: "" }, { page: null })).toBe("/clientes");
  });
});

describe("errores de base de datos", () => {
  it("traduce sin exponer detalles", () => {
    expect(dbErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "clients_legal_id_key"' })).toBe(
      "Ya existe un cliente con esa cédula jurídica.",
    );
    expect(dbErrorMessage({ code: "42501", message: "new row violates row-level security policy" })).toBe("No tiene permiso para realizar esta acción.");
    expect(dbErrorMessage({ code: "XX000", message: "relation public.secret does not exist" })).not.toMatch(/relation|public/);
    expect(dbErrorMessage({ code: "23514", message: "El proceso debe incluir etapas de categoría nuevo, contratado y descartado" })).toMatch(/etapas/);
  });
});

describe("identificadores y permisos de la fase 2A", () => {
  it("valida UUID de la URL", () => {
    expect(isUuid("11111111-0000-4000-8000-000000000001")).toBe(true);
    expect(isUuid("1; drop table clients")).toBe(false);
  });
  it("configuración: admin y coordinador; fuentes y usuarios: solo admin", () => {
    expect(can("coordinador", "configuracion:gestionar")).toBe(true);
    expect(can("reclutador", "configuracion:gestionar")).toBe(false);
    expect(can("consulta", "configuracion:gestionar")).toBe(false);
    expect(can("admin", "fuentes:gestionar")).toBe(true);
    expect(can("coordinador", "fuentes:gestionar")).toBe(false);
    expect(can("coordinador", "usuarios:gestionar")).toBe(false);
  });
});
