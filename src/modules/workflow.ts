/**
 * Flujos de estado de requisiciones y vacantes. Reflejan las reglas que la
 * base de datos aplica (migración 0820): la interfaz solo ofrece cambios
 * válidos y la BD rechaza cualquier otro.
 */
import type { RequisitionStatus, VacancyStatus } from "@/types/database";

export const REQUISITION_TRANSITIONS: Record<RequisitionStatus, RequisitionStatus[]> = {
  borrador: ["pendiente_aprobacion", "cancelada"],
  pendiente_aprobacion: ["aprobada", "borrador", "cancelada"],
  aprobada: ["en_proceso", "cerrada", "cancelada"],
  en_proceso: ["cerrada", "cancelada"],
  cerrada: ["en_proceso"],
  cancelada: [],
};

export const REQUISITION_ACTION_LABEL: Partial<Record<RequisitionStatus, string>> = {
  pendiente_aprobacion: "Enviar a aprobación",
  aprobada: "Aprobar",
  borrador: "Devolver a borrador",
  en_proceso: "Marcar en proceso",
  cerrada: "Cerrar",
  cancelada: "Cancelar",
};

/** Estados desde los que se pueden crear vacantes. */
export const REQUISITION_ACCEPTS_VACANCIES: RequisitionStatus[] = ["aprobada", "en_proceso"];

export const VACANCY_TRANSITIONS: Record<VacancyStatus, VacancyStatus[]> = {
  borrador: ["abierta", "cerrada"],
  abierta: ["pausada", "cerrada"],
  pausada: ["abierta", "cerrada"],
  cerrada: ["abierta"],
  cubierta: ["cerrada"],
};

export const VACANCY_ACTION_LABEL: Partial<Record<VacancyStatus, string>> = {
  abierta: "Publicar / abrir",
  pausada: "Pausar",
  cerrada: "Cerrar",
};

export function canTransitionRequisition(from: RequisitionStatus, to: RequisitionStatus): boolean {
  return from === to || REQUISITION_TRANSITIONS[from].includes(to);
}

export function canTransitionVacancy(from: VacancyStatus, to: VacancyStatus): boolean {
  return from === to || VACANCY_TRANSITIONS[from].includes(to);
}

/** Plazas pendientes y porcentaje cubierto. */
export function coverage(openings: number, filled: number) {
  const total = Math.max(0, openings);
  const done = Math.min(Math.max(0, filled), total);
  return { total, filled: done, pending: total - done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** ¿La fecha límite ya pasó? (fechas AAAA-MM-DD, zona de Costa Rica). */
export function isOverdue(date: string | null | undefined, today = new Date()): boolean {
  if (!date) return false;
  const cr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(today);
  return date < cr;
}

/**
 * Plazas que compromete una vacante (igual que private.vacancy_committed_openings, 0840):
 * publicadas (abierta, pausada, cubierta) → sus plazas; cerrada → las cubiertas; borrador → 0.
 */
export function committedOpenings(v: { status: VacancyStatus; openings: number; filled_count?: number | null }): number {
  if (v.status === "abierta" || v.status === "pausada" || v.status === "cubierta") return Math.max(0, v.openings);
  if (v.status === "cerrada") return Math.max(0, v.filled_count ?? 0);
  return 0;
}

/**
 * Avance de una requisición sobre sus plazas AUTORIZADAS. Las vacantes en
 * borrador no cuentan (ni sus plazas ni sus cubiertas).
 */
export function requisitionCoverage(
  authorized: number,
  vacancies: Array<{ status: VacancyStatus; openings: number; filled_count?: number | null }> | undefined,
) {
  const list = (vacancies ?? []).filter((v) => v.status !== "borrador");
  const filledRaw = list.reduce((n, v) => n + Math.max(0, v.filled_count ?? 0), 0);
  const committed = (vacancies ?? []).reduce((n, v) => n + committedOpenings(v), 0);
  const c = coverage(authorized, filledRaw);
  return { ...c, committed, available: Math.max(0, authorized - committed) };
}

/** ¿Cabe una vacante que comprometería `required` plazas, dadas las demás vacantes? */
export function fitsAuthorized(authorized: number, others: Parameters<typeof committedOpenings>[0][], required: number): boolean {
  return others.reduce((n, v) => n + committedOpenings(v), 0) + required <= authorized;
}
