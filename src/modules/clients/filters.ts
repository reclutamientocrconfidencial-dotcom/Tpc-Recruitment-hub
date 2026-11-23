import { CLIENT_STATUSES, CR_PROVINCES, type ClientStatus, type CrProvince } from "@/types/database";
import { oneOf, param, sanitizeSearch, type RawSearchParams } from "@/lib/search-params";
import { parsePage } from "@/lib/pagination";

export interface ClientFilters {
  q: string;
  status: ClientStatus | "";
  province: CrProvince | "";
  industry: string;
  page: number;
}

export function parseClientFilters(sp: RawSearchParams): ClientFilters {
  return {
    q: sanitizeSearch(param(sp, "q")),
    status: oneOf(param(sp, "estado"), CLIENT_STATUSES),
    province: oneOf(param(sp, "provincia"), CR_PROVINCES),
    industry: sanitizeSearch(param(sp, "industria")),
    page: parsePage(param(sp, "page")),
  };
}

/** Filtros como parámetros de URL (nombres en español). */
export function clientFilterParams(f: ClientFilters): Record<string, string> {
  return { q: f.q, estado: f.status, provincia: f.province, industria: f.industry };
}

export function hasActiveFilters(f: ClientFilters): boolean {
  return Boolean(f.q || f.status || f.province || f.industry);
}
