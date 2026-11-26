import { describe, expect, it } from "vitest";
import { buildIcs, icsEscape, icsFold } from "@/lib/ics";

describe("iCalendar", () => {
  it("escapa caracteres especiales", () => {
    expect(icsEscape("Sala 2; piso 3, Heredia\nTraer cédula")).toBe("Sala 2\; piso 3\\, Heredia\\nTraer cédula");
  });
  it("pliega líneas largas sin cortar caracteres multibyte", () => {
    const folded = icsFold("SUMMARY:" + "é".repeat(60));
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "é".repeat(60));
  });
  it("genera un calendario válido en UTC", () => {
    const ics = buildIcs("Mi jornada", [{ uid: "entrevista-1", start: new Date("2026-12-10T15:30:00Z"), end: new Date("2026-12-10T16:15:00Z"), summary: "Entrevista virtual · VAC-2026-00001", location: "https://meet.example/x" }], new Date("2026-11-25T00:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0")).toBe(true);
    expect(ics).toContain("DTSTART:20261210T153000Z");
    expect(ics).toContain("DTEND:20261210T161500Z");
    expect(ics).toContain("UID:entrevista-1@tpc-recruitment-hub");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });
});
