import { describe, expect, it } from "vitest";
import { loginSchema, safeRedirectPath } from "@/lib/validation";

describe("loginSchema", () => {
  it("acepta credenciales válidas y normaliza el correo", () => {
    const r = loginSchema.safeParse({ email: "  Demo@TPC-Demo.TEST ", password: "DemoTPC2026" });
    expect(r.success).toBe(true);
    expect(r.data?.email).toBe("demo@tpc-demo.test");
  });

  it("rechaza correo inválido con mensaje en español", () => {
    const r = loginSchema.safeParse({ email: "no-es-correo", password: "DemoTPC2026" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Ingrese un correo electrónico válido.");
  });

  it("rechaza contraseñas cortas o ausentes", () => {
    expect(loginSchema.safeParse({ email: "a@b.test", password: "123" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.test", password: null }).success).toBe(false);
  });
});

describe("safeRedirectPath (prevención de redirección abierta)", () => {
  it.each([
    ["/candidatos", "/candidatos"],
    ["https://malicioso.test", "/dashboard"],
    ["//malicioso.test", "/dashboard"],
    ["/\\malicioso.test", "/dashboard"],
    ["/login", "/dashboard"],
    [null, "/dashboard"],
    ["", "/dashboard"],
  ])("%s → %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});
