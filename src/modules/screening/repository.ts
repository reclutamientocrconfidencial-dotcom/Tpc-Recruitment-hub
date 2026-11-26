import "server-only";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Preselection } from "@/lib/ai/features";

export interface ScreeningRow {
  application_id: string;
  candidate: string;
  stage: string | null;
  analysis: { id: string; status: "pendiente_revision" | "aceptado"; created_at: string; data: Preselection } | null;
}

/** Comparación de candidatos: último análisis vigente de cada postulación activa (lo que RLS permite ver). */
export async function listVacancyScreenings(vacancyId: string): Promise<{ rows: ScreeningRow[]; batch: Record<string, unknown> | null; error: string | null }> {
  if (isDemoMode()) return { rows: [], batch: null, error: null };
  const sb = await createSupabaseServerClient();
  const { data: apps, error } = await sb
    .from("applications")
    .select("id, candidate:candidates(first_name, last_name), stage:vacancy_stages(name, category)")
    .eq("vacancy_id", vacancyId)
    .limit(300);
  if (error) return { rows: [], batch: null, error: "No fue posible cargar las postulaciones." };
  type A = { id: string; candidate: { first_name: string; last_name: string } | null; stage: { name: string; category: string } | null };
  const active = ((apps ?? []) as unknown as A[]).filter((a) => !a.stage || ["nuevo", "en_proceso"].includes(a.stage.category));
  const ids = active.map((a) => a.id);
  const [{ data: reqs }, { data: batch }] = await Promise.all([
    ids.length
      ? sb.from("ai_requests").select("id, application_id, status, output, created_at").eq("feature", "preseleccion").in("application_id", ids).in("status", ["pendiente_revision", "aceptado"]).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    sb.from("ai_batches").select("status, total, processed, reused, failed, cost_usd, stop_reason, created_at, finished_at").eq("vacancy_id", vacancyId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const latest = new Map<string, ScreeningRow["analysis"]>();
  for (const r of (reqs ?? []) as Array<{ id: string; application_id: string; status: "pendiente_revision" | "aceptado"; output: Preselection; created_at: string }>) {
    if (!latest.has(r.application_id) && r.output?.matriz) latest.set(r.application_id, { id: r.id, status: r.status, created_at: r.created_at, data: r.output });
  }
  return {
    rows: active.map((a) => ({ application_id: a.id, candidate: a.candidate ? `${a.candidate.first_name} ${a.candidate.last_name}` : "Candidato", stage: a.stage?.name ?? null, analysis: latest.get(a.id) ?? null })),
    batch: (batch as Record<string, unknown> | null) ?? null,
    error: null,
  };
}
