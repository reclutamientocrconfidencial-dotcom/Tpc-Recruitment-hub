import { SUBMISSION_STATUSES } from "@/types/database";
import { oneOf, param, type RawSearchParams } from "@/lib/search-params";
import { parsePage } from "@/lib/pagination";
import { isUuid } from "@/lib/ids";
import type { SubmissionFilters } from "@/modules/intake/repository";

/** Por defecto la bandeja muestra lo pendiente de revisión. */
export function parseSubmissionFilters(sp: RawSearchParams): SubmissionFilters {
  const raw = param(sp, "estado");
  const f = param(sp, "formulario");
  return {
    status: raw === "todos" ? "" : oneOf(raw || "revision", SUBMISSION_STATUSES),
    formId: isUuid(f) ? f : "",
    page: parsePage(param(sp, "page")),
  };
}

export function submissionFilterParams(f: SubmissionFilters): Record<string, string> {
  return { estado: f.status || "todos", formulario: f.formId };
}
