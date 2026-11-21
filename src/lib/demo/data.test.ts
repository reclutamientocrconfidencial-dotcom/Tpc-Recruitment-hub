import { describe, expect, it } from "vitest";
import { DEMO_APPLICATIONS, DEMO_CANDIDATES, DEMO_CLIENTS, DEMO_METRICS } from "@/lib/demo/data";

describe("datos de demostración", () => {
  it("usan exclusivamente dominios de correo reservados (.test)", () => {
    const emails = [...DEMO_CLIENTS.map((c) => c.contact_email), ...DEMO_CANDIDATES.map((c) => c.email)];
    for (const e of emails) expect(e).toMatch(/\.test$/);
  });

  it("las postulaciones referencian candidatos existentes", () => {
    const ids = new Set(DEMO_CANDIDATES.map((c) => c.id));
    for (const a of DEMO_APPLICATIONS) expect(ids.has(a.candidate_id)).toBe(true);
  });

  it("las métricas son coherentes con los datos", () => {
    expect(DEMO_METRICS.total_candidates).toBe(DEMO_CANDIDATES.length);
    expect(DEMO_METRICS.active_clients).toBe(2);
  });
});
