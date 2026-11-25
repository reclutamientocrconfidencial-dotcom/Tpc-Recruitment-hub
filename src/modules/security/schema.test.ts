import { describe, expect, it } from "vitest";
import { factorNameSchema, totpCodeSchema } from "@/modules/security/schema";

describe("verificación en dos pasos", () => {
  it("acepta 6 dígitos, también con espacios", () => {
    expect(totpCodeSchema.parse("123456")).toBe("123456");
    expect(totpCodeSchema.parse("123 456")).toBe("123456");
  });
  it("rechaza códigos inválidos", () => {
    for (const v of ["12345", "1234567", "abcdef", "", "12345a"]) expect(totpCodeSchema.safeParse(v).success).toBe(false);
  });
  it("nombre de la aplicación por omisión", () => {
    expect(factorNameSchema.parse("")).toBe("Aplicación autenticadora");
    expect(factorNameSchema.safeParse("x".repeat(41)).success).toBe(false);
  });
});
