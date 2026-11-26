"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, type ActionState } from "@/lib/action-state";
import { AiProviderError } from "@/lib/ai/provider";
import type { Preselection } from "@/lib/ai/features";
import { executeFeature } from "@/modules/ai/engine";
import { buildScreening } from "@/modules/screening/build";

async function guard() {
  const auth = await authorizeAction("postulaciones:editar");
  if (auth.error !== null) return { error: auth.error } as const;
  if (isDemoMode()) return { error: DEMO_READ_ONLY } as const;
  return { sb: await createSupabaseServerClient() } as const;
}

/** Preselección individual: si la información no cambió, reutiliza el resultado anterior (sin costo). */
export async function runScreeningAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const id = z.uuid().safeParse(formData.get("application_id"));
  if (!id.success) return { error: "Datos inválidos." };
  try {
    const built = await buildScreening(g.sb, id.data);
    const r = await executeFeature(g.sb, { feature: "preseleccion", prompt: built.prompt, sim: built.sim, ids: built.ids, subject: built.subject, reuse: true });
    revalidatePath(`/postulaciones/${id.data}`);
    return { ok: true, message: r.reused ? "La información no cambió: se reutilizó el análisis anterior sin costo." : "Análisis listo. Revíselo antes de usarlo." };
  } catch (err) {
    if (!(err instanceof AiProviderError)) console.error("[screening.run]", err);
    return { error: err instanceof AiProviderError ? err.message : "No fue posible completar el análisis." };
  }
}

export interface BatchProgress {
  error?: string;
  batchId?: string;
  status?: string;
  total?: number;
  processed?: number;
  reused?: number;
  failed?: number;
  cost?: number;
  stopReason?: string | null;
  finished?: boolean;
  lastError?: string | null;
}

async function progress(sb: Awaited<ReturnType<typeof createSupabaseServerClient>>, batchId: string, lastError: string | null = null): Promise<BatchProgress> {
  const { data: b } = await sb.from("ai_batches").select("id, status, total, processed, reused, failed, cost_usd, stop_reason").eq("id", batchId).maybeSingle();
  if (!b) return { error: "No se encontró el lote." };
  return { batchId: b.id, status: b.status, total: b.total, processed: b.processed, reused: b.reused, failed: b.failed, cost: Number(b.cost_usd), stopReason: b.stop_reason, finished: b.status !== "en_proceso", lastError };
}

const startSchema = z.object({ vacancy_id: z.uuid(), max_cost: z.coerce.number().min(0).max(100, "El tope por lote es de US$ 0 a 100.") });

/** Crea un lote con las postulaciones activas de la vacante (máx. 200). */
export async function startBatchAction(vacancyId: string, maxCost: number): Promise<BatchProgress> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const p = startSchema.safeParse({ vacancy_id: vacancyId, max_cost: maxCost });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Datos inválidos." };
  const { data, error } = await g.sb.rpc("create_ai_batch", { p_vacancy_id: p.data.vacancy_id, p_max_cost: p.data.max_cost });
  if (error) return { error: dbErrorMessage(error) };
  return progress(g.sb, data as string);
}

/** Procesa UN elemento del lote (el navegador repite la llamada y muestra el avance). */
export async function stepBatchAction(batchId: string): Promise<BatchProgress> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  if (!z.uuid().safeParse(batchId).success) return { error: "Datos inválidos." };
  const { data: next, error } = await g.sb.rpc("next_ai_batch_item", { p_batch_id: batchId });
  if (error) return { error: dbErrorMessage(error) };
  if (!next) return progress(g.sb, batchId);
  const item = next as { item_id: string; application_id: string };
  let lastError: string | null = null;
  try {
    const built = await buildScreening(g.sb, item.application_id);
    const r = await executeFeature(g.sb, { feature: "preseleccion", prompt: built.prompt, sim: built.sim, ids: built.ids, subject: built.subject, reuse: true, tag: { batch_id: batchId } });
    const fin = await g.sb.rpc("finish_ai_batch_item", { p_item_id: item.item_id, p_status: r.reused ? "reutilizado" : "procesado", p_request_id: r.requestId });
    if (fin.error) return { error: dbErrorMessage(fin.error) };
  } catch (err) {
    lastError = err instanceof AiProviderError ? err.message : "No fue posible analizar esta postulación.";
    if (!(err instanceof AiProviderError)) console.error("[screening.batch]", err);
    await g.sb.rpc("finish_ai_batch_item", { p_item_id: item.item_id, p_status: "error", p_error: lastError });
  }
  return progress(g.sb, batchId, lastError);
}

export async function cancelBatchAction(batchId: string): Promise<BatchProgress> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  if (!z.uuid().safeParse(batchId).success) return { error: "Datos inválidos." };
  const { error } = await g.sb.rpc("cancel_ai_batch", { p_batch_id: batchId });
  if (error) return { error: dbErrorMessage(error) };
  return progress(g.sb, batchId);
}

/**
 * Aplica un análisis ACEPTADO por una persona a los requisitos que siguen
 * PENDIENTES: «confirmado» → cumple, «incumplido» → no cumple (con la
 * evidencia como nota). Lo parcial o insuficiente queda pendiente. Nunca
 * cambia etapas ni descarta: la decisión sigue siendo del reclutador.
 */
export async function applyScreeningAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Datos inválidos." };
  const { data: req } = await g.sb.from("ai_requests").select("status, feature, application_id, output").eq("id", id.data).maybeSingle();
  if (!req || req.status !== "aceptado" || req.feature !== "preseleccion" || !req.application_id) return { error: "Solo se aplica un análisis aceptado." };
  let built;
  try {
    built = await buildScreening(g.sb, req.application_id);
  } catch (err) {
    return { error: err instanceof AiProviderError ? err.message : "No fue posible aplicar el análisis." };
  }
  let applied = 0;
  for (const m of (req.output as Preselection).matriz ?? []) {
    const reqId = built.requirementIds[m.requisito];
    const current = built.sim.requirements?.find((r) => r.name === m.requisito)?.status;
    if (!reqId || (current && current !== "pendiente") || (m.estado !== "confirmado" && m.estado !== "incumplido")) continue;
    const { error } = await g.sb.rpc("set_requirement_check", {
      p_application_id: req.application_id,
      p_requirement_id: reqId,
      p_status: m.estado === "confirmado" ? "cumple" : "no_cumple",
      p_level_id: null,
      p_note: `Preselección revisada: ${m.evidencia}`.slice(0, 300),
    });
    if (error) return { error: dbErrorMessage(error) };
    applied++;
  }
  revalidatePath(`/postulaciones/${req.application_id}`);
  return { ok: true, message: applied ? `Se actualizaron ${applied} requisito(s) pendiente(s). Lo parcial o sin información sigue pendiente.` : "No había requisitos pendientes con evidencia concluyente: no se cambió nada." };
}
