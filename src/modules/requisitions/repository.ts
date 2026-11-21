import "server-only";
import { DEMO_REQUISITIONS } from "@/lib/demo/data";
import { DEFAULT_PAGE_SIZE, runQuery } from "@/modules/shared";
import type { Requisition } from "@/types/database";

export function listRequisitions() {
  return runQuery<Requisition>(
    () => DEMO_REQUISITIONS,
    (sb) =>
      sb
        .from("requisitions")
        .select(
          "id, code, client_id, title, department, positions_count, priority, status, salary_min, salary_max, currency, target_date, created_at, client:clients(id, name)",
        )
        .order("created_at", { ascending: false })
        .limit(DEFAULT_PAGE_SIZE),
  );
}
