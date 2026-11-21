import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, formatSalaryRange, fullName, initials } from "@/lib/format";

describe("formato", () => {
  it("formatea colones sin decimales", () => {
    const out = formatCurrency(850000, "CRC");
    expect(out).toContain("₡");
    expect(out.replace(/\D/g, "")).toBe("850000");
  });

  it("formatea dólares", () => {
    expect(formatCurrency(1200, "USD")).toMatch(/1.?200/);
  });

  it("maneja valores vacíos", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("no-es-fecha")).toBe("—");
    expect(fullName(null)).toBe("—");
  });

  it("rangos salariales", () => {
    expect(formatSalaryRange(null, null)).toBe("A convenir");
    expect(formatSalaryRange(100, null, "USD")).toMatch(/^Desde/);
    expect(formatSalaryRange(null, 100, "USD")).toMatch(/^Hasta/);
    expect(formatSalaryRange(1, 2, "USD")).toContain("–");
  });

  it("fechas en español de Costa Rica (sin corrimiento de zona horaria)", () => {
    expect(formatDate("2026-12-15")).toMatch(/15.*dic.*2026/i);
  });

  it("iniciales", () => {
    expect(initials("Usuaria Demo")).toBe("UD");
    expect(initials("Ana")).toBe("A");
    expect(initials("  ")).toBe("?");
  });
});
