import "server-only";
import { DEMO_APPLICATIONS } from "@/lib/demo/data";
import { DEFAULT_PAGE_SIZE, runQuery } from "@/modules/shared";
import type { Application } from "@/types/database";

const SELECT =
  "id, vacancy_id, candidate_id, stage, rating, applied_at, stage_changed_at, candidate:candidates(id, first_name, last_name), vacancy:vacancies(id, code, title)";

export function listApplications(limit = DEFAULT_PAGE_SIZE) {
  return runQuery<Application>(
    () => DEMO_APPLICATIONS.slice(0, limit),
    (sb) => sb.from("applications").select(SELECT).order("stage_changed_at", { ascending: false }).limit(limit),
  );
}
