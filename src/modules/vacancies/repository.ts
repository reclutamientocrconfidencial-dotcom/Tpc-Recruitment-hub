import "server-only";
import { DEMO_VACANCIES } from "@/lib/demo/data";
import { DEFAULT_PAGE_SIZE, runQuery } from "@/modules/shared";
import type { Vacancy } from "@/types/database";

export function listVacancies() {
  return runQuery<Vacancy>(
    () => DEMO_VACANCIES,
    (sb) =>
      sb
        .from("vacancies")
        .select(
          "id, code, requisition_id, title, province, modality, employment_type, status, openings, salary_min, salary_max, currency, published_at, closes_at, created_at, requisition:requisitions(id, code, client:clients(id, name))",
        )
        .order("created_at", { ascending: false })
        .limit(DEFAULT_PAGE_SIZE),
  );
}
