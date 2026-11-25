import { describe, expect, it } from "vitest";
import { APP_ROLES } from "@/types/database";
import { PERMISSIONS, ROLE_LABELS, can, permissionsFor } from "@/lib/auth/permissions";

describe("matriz de permisos", () => {
  it("el administrador tiene todos los permisos", () => {
    for (const p of PERMISSIONS) expect(can("admin", p)).toBe(true);
  });

  it("todos los roles pueden ver los módulos principales", () => {
    for (const role of APP_ROLES) {
      for (const p of ["dashboard:ver", "clientes:ver", "candidatos:ver", "postulaciones:ver"] as const) {
        expect(can(role, p)).toBe(true);
      }
    }
  });

  it("solo el administrador elimina registros y gestiona usuarios", () => {
    for (const role of APP_ROLES.filter((r) => r !== "admin")) {
      expect(permissionsFor(role).some((p) => p.endsWith(":eliminar"))).toBe(false);
      expect(can(role, "usuarios:gestionar")).toBe(false);
      expect(can(role, "auditoria:ver")).toBe(false);
    }
  });

  it("el reclutador no crea clientes ni requisiciones (coincide con RLS)", () => {
    expect(can("reclutador", "clientes:crear")).toBe(false);
    expect(can("reclutador", "requisiciones:crear")).toBe(false);
    expect(can("reclutador", "candidatos:crear")).toBe(true);
    expect(can("reclutador", "postulaciones:editar")).toBe(true);
  });

  it("el rol consulta es de solo lectura", () => {
    expect(permissionsFor("consulta").every((p) => p.endsWith(":ver"))).toBe(true);
  });

  it("recepción: consulta no ve envíos; solo admin y coordinación gestionan formularios", () => {
    expect(can("consulta", "recepcion:ver")).toBe(false);
    expect(can("reclutador", "recepcion:ver")).toBe(true);
    expect(can("reclutador", "formularios:gestionar")).toBe(false);
    expect(can("coordinador", "formularios:gestionar")).toBe(true);
  });

  it("solo administración gestiona la plantilla del informe ejecutivo", () => {
    expect(can("admin", "plantillas:gestionar")).toBe(true);
    for (const r of ["coordinador", "reclutador", "consulta"] as const) expect(can(r, "plantillas:gestionar")).toBe(false);
  });

  it("sin rol no hay permisos", () => {
    expect(permissionsFor(null)).toEqual([]);
    expect(can(undefined, "dashboard:ver")).toBe(false);
  });

  it("cada rol tiene etiqueta en español", () => {
    for (const role of APP_ROLES) expect(ROLE_LABELS[role]).toBeTruthy();
  });
});
