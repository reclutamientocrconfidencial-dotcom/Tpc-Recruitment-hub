import { CANDIDATE_STATUSES, CR_PROVINCES, ENGLISH_LEVELS, type CandidateStatus, type CrProvince } from "@/types/database";
import { oneOf, param, sanitizeSearch, type RawSearchParams } from "@/lib/search-params";
import { parsePage } from "@/lib/pagination";
import { isUuid } from "@/lib/ids";

export interface CandidateFilters {
  q: string;
  province: CrProvince | "";
  canton: string;
  positionId: string;
  channelId: string;
  english: (typeof ENGLISH_LEVELS)[number] | "";
  minYears: number | null;
  status: CandidateStatus | "";
  ownerId: string;
  page: number;
}

export function parseCandidateFilters(sp: RawSearchParams): CandidateFilters {
  const pos = param(sp, "perfil");
  const ch = param(sp, "fuente");
  const owner = param(sp, "responsable");
  const years = Number.parseFloat(param(sp, "experiencia"));
  return {
    q: sanitizeSearch(param(sp, "q")),
    province: oneOf(param(sp, "provincia"), CR_PROVINCES),
    canton: sanitizeSearch(param(sp, "canton")).slice(0, 80),
    positionId: isUuid(pos) ? pos : "",
    channelId: isUuid(ch) ? ch : "",
    english: oneOf(param(sp, "ingles"), ENGLISH_LEVELS),
    minYears: Number.isFinite(years) && years >= 0 && years <= 70 ? years : null,
    status: oneOf(param(sp, "estado"), CANDIDATE_STATUSES),
    ownerId: isUuid(owner) ? owner : "",
    page: parsePage(param(sp, "page")),
  };
}

export function candidateFilterParams(f: CandidateFilters): Record<string, string> {
  return {
    q: f.q,
    provincia: f.province,
    canton: f.canton,
    perfil: f.positionId,
    fuente: f.channelId,
    ingles: f.english,
    experiencia: f.minYears == null ? "" : String(f.minYears),
    estado: f.status,
    responsable: f.ownerId,
  };
}

export function hasCandidateFilters(f: CandidateFilters): boolean {
  return Boolean(f.q || f.province || f.canton || f.positionId || f.channelId || f.english || f.minYears != null || f.status || f.ownerId);
}

/** Nombre normalizado para la búsqueda (igual que private.norm_name en la BD). */
export function normalizeName(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
