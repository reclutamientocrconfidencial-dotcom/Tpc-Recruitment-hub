import {
  CR_PROVINCES,
  PRIORITY_LEVELS,
  VACANCY_STATUSES,
  WORK_MODALITIES,
  type CrProvince,
  type PriorityLevel,
  type VacancyStatus,
  type WorkModality,
} from "@/types/database";
import { oneOf, param, sanitizeSearch, type RawSearchParams } from "@/lib/search-params";
import { parsePage } from "@/lib/pagination";
import { isUuid } from "@/lib/ids";

export interface VacancyFilters {
  q: string;
  status: VacancyStatus | "";
  priority: PriorityLevel | "";
  modality: WorkModality | "";
  province: CrProvince | "";
  clientId: string;
  recruiterId: string;
  /** Solo vacantes con plazas pendientes (borrador, abierta o pausada). */
  pending: boolean;
  page: number;
}

/** Estados con plazas pendientes: la BD marca «cubierta» cuando se completan. */
export const PENDING_STATUSES: VacancyStatus[] = ["borrador", "abierta", "pausada"];

export function parseVacancyFilters(sp: RawSearchParams): VacancyFilters {
  const client = param(sp, "cliente");
  const recruiter = param(sp, "responsable");
  return {
    q: sanitizeSearch(param(sp, "q")),
    status: oneOf(param(sp, "estado"), VACANCY_STATUSES),
    priority: oneOf(param(sp, "prioridad"), PRIORITY_LEVELS),
    modality: oneOf(param(sp, "modalidad"), WORK_MODALITIES),
    province: oneOf(param(sp, "provincia"), CR_PROVINCES),
    clientId: isUuid(client) ? client : "",
    recruiterId: isUuid(recruiter) ? recruiter : "",
    pending: param(sp, "pendientes") === "1",
    page: parsePage(param(sp, "page")),
  };
}

export function vacancyFilterParams(f: VacancyFilters): Record<string, string> {
  return {
    q: f.q,
    estado: f.status,
    prioridad: f.priority,
    modalidad: f.modality,
    provincia: f.province,
    cliente: f.clientId,
    responsable: f.recruiterId,
    pendientes: f.pending ? "1" : "",
  };
}

export function hasVacancyFilters(f: VacancyFilters): boolean {
  return Boolean(f.q || f.status || f.priority || f.modality || f.province || f.clientId || f.recruiterId || f.pending);
}
