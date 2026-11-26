import { describe, expect, it } from "vitest";
import { parseXlsx } from "@/lib/import/xlsx";
import { safeCell, toCsv, toXlsx } from "@/lib/export/tabular";

describe("exportaciones tabulares", () => {
  it("neutraliza fórmulas (inyección CSV/Excel)", () => {
    expect(safeCell("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")");
    expect(safeCell("+50688887777")).toBe("'+50688887777");
    expect(safeCell("-1")).toBe("'-1");
    expect(safeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(safeCell("Normal")).toBe("Normal");
    expect(safeCell(null)).toBe("");
  });
  it("CSV con BOM, comillas y números sin alterar", () => {
    const csv = toCsv(["Cliente", "Contrataciones"], [["Cliente, S.A. \"Ficticio\"", 3], ["=cmd", -2]]);
    expect(csv.startsWith("﻿Cliente,Contrataciones\r\n")).toBe(true);
    expect(csv).toContain('"Cliente, S.A. ""Ficticio""",3');
    expect(csv).toContain("'=cmd,-2");
  });
  it("XLSX legible por el lector del sistema, con tildes y fórmulas neutralizadas", () => {
    const bytes = toXlsx("Fuentes", ["Fuente", "Postulaciones"], [["Ferias de empleo", 12], ["=1+1", 0], ["Señalización ñ", null]]);
    const rows = parseXlsx(bytes);
    expect(rows[0]).toEqual(["Fuente", "Postulaciones"]);
    expect(rows[1]).toEqual(["Ferias de empleo", "12"]);
    expect(rows[2]![0]).toBe("'=1+1");
    expect(rows[3]![0]).toBe("Señalización ñ");
  });
});
