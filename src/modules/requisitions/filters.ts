import { PRIORITY_LEVELS, REQUISITION_STATUSES, type PriorityLevel, type RequisitionStatus } from "@/types/database";
import { oneOf, param, sanitizeSearch, type RawSearchParams } from "@/lib/search-params";
import { parsePage } from "@/lib/pagination";
import { isUuid } from "@/lib/ids";

export interface RequisitionFilters {
  q: string;
  status: RequisitionStatus | "";
  priority: PriorityLevel | "";
  clientId: string;
  recruiterId: string;
  overdue: boolean;
  page: number;
}

export function parseRequisitionFilters(sp: RawSearchParams): RequisitionFilters {
  const client = param(sp, "cliente");
  const recruiter = param(sp, "responsable");
  return {
    q: sanitizeSearch(param(sp, "q")),
    status: oneOf(param(sp, "estado"), REQUISITION_STATUSES),
    priority: oneOf(param(sp, "prioridad"), PRIORITY_LEVELS),
    clientId: isUuid(client) ? client : "",
    recruiterId: isUuid(recruiter) ? recruiter : "",
    overdue: param(sp, "vencidas") === "1",
    page: parsePage(param(sp, "page")),
  };
}

export function requisitionFilterParams(f: RequisitionFilters): Record<string, string> {
  return { q: f.q, estado: f.status, prioridad: f.priority, cliente: f.clientId, responsable: f.recruiterId, vencidas: f.overdue ? "1" : "" };
}

export function hasRequisitionFilters(f: RequisitionFilters): boolean {
  return Boolean(f.q || f.status || f.priority || f.clientId || f.recruiterId || f.overdue);
}
