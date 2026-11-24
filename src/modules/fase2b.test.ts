import { describe, expect, it } from "vitest";
import { requisitionSchema } from "@/modules/requisitions/schema";
import { parseRequisitionFilters, requisitionFilterParams } from "@/modules/requisitions/filters";
import { filledSchema, vacancySchema } from "@/modules/vacancies/schema";
import { parseVacancyFilters } from "@/modules/vacancies/filters";
import {
  canTransitionRequisition,
  canTransitionVacancy,
  committedOpenings,
  coverage,
  fitsAuthorized,
  isOverdue,
  requisitionCoverage,
  REQUISITION_TRANSITIONS,
} from "@/modules/workflow";
import { REQUISITION_STATUSES } from "@/types/database";

const UUID = "11111111-0000-4000-8000-000000000001";

const req = {
  client_id: UUID,
  position_id: "",
  position_id_new: "",
  title: "Bodeguero(a) ficticio",
  department: "",
  positions_count: "3",
  priority: "alta",
  target_date: "2027-01-15",
  salary_min: "450000",
  salary_max: "",
  currency: "CRC",
  province: "Heredia",
  modality: "",
  work_schedule: "L-V 7:00 a 16:00",
  requested_by_name: "",
  justification: "",
  assigned_recruiter_id: "",
};

describe("requisitionSchema", () => {
  it("acepta una requisición y convierte vacíos en null", () => {
    const r = requisitionSchema.parse(req);
    expect(r.positions_count).toBe(3);
    expect(r.salary_min).toBe(450000);
    expect(r.salary_max).toBeNull();
    expect(r.modality).toBeNull();
    expect(r.position_id).toBeNull();
  });
  it("exige cliente y plazas válidas", () => {
    const r = requisitionSchema.safeParse({ ...req, client_id: "", positions_count: "0" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toContain("client_id");
    expect(paths).toContain("positions_count");
  });
  it("rechaza salario mínimo mayor que el máximo", () => {
    const r = requisitionSchema.safeParse({ ...req, salary_min: "900", salary_max: "100" });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.path).toEqual(["salary_max"]);
  });
  it("rechaza provincia, prioridad o fecha inválidas", () => {
    expect(requisitionSchema.safeParse({ ...req, province: "Atlántida" }).success).toBe(false);
    expect(requisitionSchema.safeParse({ ...req, priority: "maxima" }).success).toBe(false);
    expect(requisitionSchema.safeParse({ ...req, target_date: "15/01/2027" }).success).toBe(false);
  });
  it("no acepta el estado desde el formulario (se cambia con el flujo)", () => {
    const r = requisitionSchema.parse({ ...req, status: "aprobada" });
    expect("status" in r).toBe(false);
  });
});

describe("vacancySchema", () => {
  const vac = {
    title: "Bodeguero(a)",
    openings: "2",
    modality: "presencial",
    employment_type: "tiempo_completo",
    currency: "CRC",
    priority: "media",
    closes_at: "",
    recruiter_id: "",
  };
  it("acepta una vacante mínima", () => {
    const v = vacancySchema.parse(vac);
    expect(v.openings).toBe(2);
    expect(v.closes_at).toBeNull();
    expect("filled_count" in v).toBe(false);
  });
  it("valida plazas y modalidad", () => {
    expect(vacancySchema.safeParse({ ...vac, openings: "501" }).success).toBe(false);
    expect(vacancySchema.safeParse({ ...vac, modality: "otro" }).success).toBe(false);
  });
  it("plazas cubiertas: enteros no negativos", () => {
    expect(filledSchema.safeParse({ id: UUID, filled_count: "-1" }).success).toBe(false);
    expect(filledSchema.safeParse({ id: UUID, filled_count: "1.5" }).success).toBe(false);
    expect(filledSchema.parse({ id: UUID, filled_count: "2" }).filled_count).toBe(2);
  });
});

describe("filtros", () => {
  it("requisiciones: ignora valores inválidos y limpia la búsqueda", () => {
    const f = parseRequisitionFilters({ q: "ventas%,()", estado: "borrada", prioridad: "alta", cliente: "x", vencidas: "1", page: "-3" });
    expect(f).toMatchObject({ q: "ventas", status: "", priority: "alta", clientId: "", overdue: true, page: 1 });
    expect(requisitionFilterParams(f)).toMatchObject({ prioridad: "alta", vencidas: "1" });
  });
  it("vacantes: pendientes, modalidad y provincia", () => {
    const f = parseVacancyFilters({ pendientes: "1", modalidad: "remoto", provincia: "Limón", responsable: UUID });
    expect(f).toMatchObject({ pending: true, modality: "remoto", province: "Limón", recruiterId: UUID });
    expect(parseVacancyFilters({ provincia: "Panamá" }).province).toBe("");
  });
});

describe("flujo de estados", () => {
  it("requisiciones: refleja las transiciones de la base de datos", () => {
    expect(canTransitionRequisition("borrador", "pendiente_aprobacion")).toBe(true);
    expect(canTransitionRequisition("borrador", "aprobada")).toBe(false);
    expect(canTransitionRequisition("pendiente_aprobacion", "aprobada")).toBe(true);
    expect(canTransitionRequisition("cancelada", "borrador")).toBe(false);
    expect(canTransitionRequisition("cerrada", "en_proceso")).toBe(true);
    for (const s of REQUISITION_STATUSES) expect(REQUISITION_TRANSITIONS[s]).not.toContain(s);
  });
  it("vacantes: no vuelven a borrador", () => {
    for (const s of ["abierta", "pausada", "cerrada", "cubierta"] as const) expect(canTransitionVacancy(s, "borrador")).toBe(false);
    expect(canTransitionVacancy("borrador", "abierta")).toBe(true);
  });
  it("cobertura de plazas", () => {
    expect(coverage(3, 1)).toEqual({ total: 3, filled: 1, pending: 2, percent: 33 });
    expect(coverage(2, 5)).toEqual({ total: 2, filled: 2, pending: 0, percent: 100 });
    expect(coverage(0, 0).percent).toBe(0);
  });
  it("fecha límite vencida (zona de Costa Rica)", () => {
    const now = new Date("2026-11-24T05:00:00Z"); // 23:00 del 23/11 en Costa Rica
    expect(isOverdue("2026-11-23", now)).toBe(false);
    expect(isOverdue("2026-11-22", now)).toBe(true);
    expect(isOverdue(null, now)).toBe(false);
  });
});

describe("plazas autorizadas de la requisición (0840)", () => {
  const cubierta = { status: "cubierta" as const, openings: 2, filled_count: 2 };
  const duplicadoBorrador = { status: "borrador" as const, openings: 2, filled_count: 0 };

  it("REQ-2026-00004: el borrador no cuenta; avance 2/2 sobre las autorizadas", () => {
    const c = requisitionCoverage(2, [cubierta, duplicadoBorrador]);
    expect(c).toMatchObject({ total: 2, filled: 2, pending: 0, percent: 100, committed: 2, available: 0 });
  });
  it("plazas comprometidas según el estado", () => {
    expect(committedOpenings({ status: "borrador", openings: 5, filled_count: 0 })).toBe(0);
    expect(committedOpenings({ status: "abierta", openings: 3, filled_count: 1 })).toBe(3);
    expect(committedOpenings({ status: "pausada", openings: 3, filled_count: 0 })).toBe(3);
    expect(committedOpenings(cubierta)).toBe(2);
    expect(committedOpenings({ status: "cerrada", openings: 3, filled_count: 1 })).toBe(1);
  });
  it("no se puede publicar el duplicado si excede las autorizadas", () => {
    expect(fitsAuthorized(2, [cubierta], committedOpenings({ ...duplicadoBorrador, status: "abierta" }))).toBe(false);
    expect(fitsAuthorized(4, [cubierta], 2)).toBe(true);
    expect(fitsAuthorized(2, [{ status: "cerrada", openings: 2, filled_count: 0 }], 2)).toBe(true);
  });
  it("el avance no supera las autorizadas y sin vacantes queda en 0", () => {
    expect(requisitionCoverage(3, []).percent).toBe(0);
    expect(requisitionCoverage(3, undefined)).toMatchObject({ total: 3, filled: 0, pending: 3, available: 3 });
    expect(requisitionCoverage(1, [{ status: "cerrada", openings: 3, filled_count: 3 }]).filled).toBe(1);
  });
});
