import "server-only";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AnalyticsFilters {
  from: string;
  to: string;
  clientId: string;
}

export interface Summary {
  open_requisitions: number;
  open_vacancies: number;
  openings_open: number;
  filled_open: number;
  overdue_vacancies: number;
  applications: number;
  hires: number;
  avg_days_to_hire: number | null;
  active_pipeline: number;
  scope: "global" | "propio";
}
export interface Funnel {
  by_category: Record<string, number>;
  discard_reasons: Array<{ reason: string; count: number }>;
}
export interface StageTime {
  stage_name: string;
  category: string;
  transitions: number;
  avg_days: number | null;
  median_days: number | null;
  target_days: number | null;
}
export interface SourceRow {
  source: string;
  applications: number;
  hires: number;
  hire_rate: number | null;
  avg_days_to_hire: number | null;
}
export interface RecruiterRow {
  recruiter_id: string;
  full_name: string;
  active_applications: number;
  applications: number;
  hires: number;
  avg_days_to_hire: number | null;
  interviews_done: number;
  reports_finalized: number;
}
export interface ClientRow {
  client_id: string;
  client_name: string;
  open_requisitions: number;
  open_vacancies: number;
  openings: number;
  filled: number;
  applications: number;
  hires: number;
  avg_days_to_hire: number | null;
  overdue_vacancies: number;
}

export interface Analytics {
  summary: Summary | null;
  funnel: Funnel | null;
  stages: StageTime[];
  sources: SourceRow[];
  recruiters: RecruiterRow[];
  clients: ClientRow[];
  error: string | null;
}

/** Indicadores agregados (sin datos personales). La BD decide el alcance según el rol. */
export async function getAnalytics(f: AnalyticsFilters): Promise<Analytics> {
  const empty: Analytics = { summary: null, funnel: null, stages: [], sources: [], recruiters: [], clients: [], error: null };
  if (isDemoMode()) return empty;
  try {
    const sb = await createSupabaseServerClient();
    const args = { p_from: f.from, p_to: f.to, p_client: f.clientId || null };
    const [summary, funnel, stages, sources, recruiters, clients] = await Promise.all([
      sb.rpc("analytics_summary", args),
      sb.rpc("analytics_funnel", args),
      sb.rpc("analytics_stage_times", args),
      sb.rpc("analytics_sources", args),
      sb.rpc("analytics_recruiters", args),
      sb.rpc("analytics_clients", { p_from: f.from, p_to: f.to }),
    ]);
    const err = [summary, funnel, stages, sources, recruiters, clients].find((r) => r.error)?.error;
    if (err) {
      console.error("[analytics]", err.code, err.message);
      return { ...empty, error: err.code === "22023" ? "Rango de fechas no válido (máximo dos años)." : "No fue posible cargar los indicadores." };
    }
    return {
      summary: summary.data as Summary,
      funnel: funnel.data as Funnel,
      stages: (stages.data ?? []) as StageTime[],
      sources: (sources.data ?? []) as SourceRow[],
      recruiters: (recruiters.data ?? []) as RecruiterRow[],
      clients: ((clients.data ?? []) as ClientRow[]).filter((c) => !f.clientId || c.client_id === f.clientId),
      error: null,
    };
  } catch (e) {
    console.error("[analytics]", e);
    return { ...empty, error: "No fue posible conectar con la base de datos." };
  }
}
