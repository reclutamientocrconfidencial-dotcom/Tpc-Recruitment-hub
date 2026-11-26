import { STAGE_CATEGORIES, type StageCategory } from "@/types/database";
import { oneOf, param, sanitizeSearch, type RawSearchParams } from "@/lib/search-params";
import { parsePage } from "@/lib/pagination";
import { isUuid } from "@/lib/ids";

export interface ApplicationFilters {
  q: string;
  vacancyId: string;
  category: StageCategory | "";
  recruiterId: string;
  pendingAction: boolean;
  page: number;
}

export function parseApplicationFilters(sp: RawSearchParams): ApplicationFilters {
  const v = param(sp, "vacante");
  const r = param(sp, "responsable");
  return {
    q: sanitizeSearch(param(sp, "q")),
    vacancyId: isUuid(v) ? v : "",
    category: oneOf(param(sp, "etapa"), STAGE_CATEGORIES),
    recruiterId: isUuid(r) ? r : "",
    pendingAction: param(sp, "pendientes") === "1",
    page: parsePage(param(sp, "page")),
  };
}

export function applicationFilterParams(f: ApplicationFilters): Record<string, string> {
  return { q: f.q, vacante: f.vacancyId, etapa: f.category, responsable: f.recruiterId, pendientes: f.pendingAction ? "1" : "" };
}

export function hasApplicationFilters(f: ApplicationFilters): boolean {
  return Boolean(f.q || f.vacancyId || f.category || f.recruiterId || f.pendingAction);
}

/** Días en la etapa actual (para alertas de tiempo objetivo). */
export function daysInStage(changedAt: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(changedAt).getTime()) / 86_400_000));
}
