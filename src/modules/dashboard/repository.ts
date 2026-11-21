import "server-only";
import { DEMO_METRICS } from "@/lib/demo/data";
import { runQuery } from "@/modules/shared";
import type { DashboardMetrics } from "@/types/database";

const EMPTY: DashboardMetrics = {
  active_clients: 0,
  open_requisitions: 0,
  open_vacancies: 0,
  total_candidates: 0,
  active_applications: 0,
  hires_this_month: 0,
};

/** Métricas desde la vista `dashboard_metrics` (security_invoker: respeta RLS). */
export async function getDashboardMetrics(): Promise<{ data: DashboardMetrics; error: string | null }> {
  const result = await runQuery<DashboardMetrics>(
    () => [DEMO_METRICS],
    (sb) => sb.from("dashboard_metrics").select("*").limit(1),
  );
  const row = result.data[0];
  return {
    error: result.error,
    data: row
      ? (Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v) || 0])) as unknown as DashboardMetrics)
      : EMPTY,
  };
}
