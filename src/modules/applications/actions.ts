"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, type ActionState } from "@/lib/action-state";
import { DISCARD_REASONS, REQUIREMENT_CHECK_STATUSES } from "@/types/database";

function refresh(vacancyId?: string | null, applicationId?: string | null) {
  revalidatePath("/postulaciones");
  if (vacancyId) {
    revalidatePath(`/vacantes/${vacancyId}`);
    revalidatePath(`/vacantes/${vacancyId}/postulaciones`);
  }
  if (applicationId) revalidatePath(`/postulaciones/${applicationId}`);
}

/** Vincula un candidato a una vacante (la BD valida consentimiento, estado de la vacante y duplicados). */
export async function createApplicationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("postulaciones:crear");
  if (auth.error !== null) return { error: auth.error };
  const vacancy = z.uuid({ error: "Seleccione la vacante." }).safeParse(formData.get("vacancy_id"));
  const candidate = z.uuid({ error: "Seleccione el candidato." }).safeParse(formData.get("candidate_id"));
  const note = z.string().trim().max(2000).safeParse(String(formData.get("note") ?? ""));
  if (!vacancy.success) return { error: vacancy.error.issues[0]?.message };
  if (!candidate.success) return { error: candidate.error.issues[0]?.message };
  if (!note.success) return { error: "Observación: máximo 2.000 caracteres." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("create_application", { p_vacancy_id: vacancy.data, p_candidate_id: candidate.data, p_note: note.data || null });
  if (error) {
    console.warn("[applications.create]", error.code);
    return { error: dbErrorMessage(error) };
  }
  refresh(vacancy.data, data as string);
  revalidatePath(`/candidatos/${candidate.data}`);
  if (formData.get("go_to") === "postulacion") redirect(`/postulaciones/${data as string}?ok=creado`);
  return { ok: true, message: "Candidato agregado al proceso." };
}

const moveSchema = z.object({
  application_id: z.uuid(),
  stage_id: z.uuid({ error: "Seleccione la etapa." }),
  vacancy_id: z.uuid(),
  discard_reason: z.union([z.enum(DISCARD_REASONS), z.literal("")]).optional().transform((v) => (v ? v : null)),
  discard_note: z.string().trim().max(500, "Detalle: máximo 500 caracteres.").optional().transform((v) => (v ? v : null)),
});

/** Cambio de etapa. Descartar exige motivo; contratar exige plazas disponibles (la BD lo valida). */
export async function moveApplicationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("postulaciones:editar");
  if (auth.error !== null) return { error: auth.error };
  const parsed = moveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("move_application", {
    p_application_id: parsed.data.application_id,
    p_stage_id: parsed.data.stage_id,
    p_discard_reason: parsed.data.discard_reason,
    p_discard_note: parsed.data.discard_note,
  });
  if (error) {
    console.warn("[applications.move]", error.code);
    return { error: dbErrorMessage(error) };
  }
  refresh(parsed.data.vacancy_id, parsed.data.application_id);
  return { ok: true, message: "Etapa actualizada." };
}

export async function trackingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("postulaciones:editar");
  if (auth.error !== null) return { error: auth.error };
  const parsed = z
    .object({
      application_id: z.uuid(),
      rating: z.union([z.literal(""), z.coerce.number().int().min(1).max(5)]).transform((v) => (v === "" ? null : v)),
      next_action: z.string().trim().max(200, "Próximo paso: máximo 200 caracteres.").transform((v) => v || null),
      next_action_at: z.union([z.literal(""), z.iso.date({ error: "Fecha inválida." })]).transform((v) => v || null),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("update_application_tracking", {
    p_application_id: parsed.data.application_id,
    p_rating: parsed.data.rating,
    p_next_action: parsed.data.next_action,
    p_next_action_at: parsed.data.next_action_at,
  });
  if (error) return { error: dbErrorMessage(error) };
  refresh(null, parsed.data.application_id);
  return { ok: true, message: "Seguimiento actualizado." };
}

export async function addNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("postulaciones:editar");
  if (auth.error !== null) return { error: auth.error };
  const parsed = z
    .object({
      application_id: z.uuid(),
      body: z.string().trim().min(1, "Escriba la observación.").max(2000, "Máximo 2.000 caracteres."),
      visibility: z.enum(["equipo", "confidencial"]),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("application_notes").insert({ ...parsed.data, author_id: auth.user!.id });
  if (error) {
    console.warn("[applications.note]", error.code);
    return { error: dbErrorMessage(error) };
  }
  refresh(null, parsed.data.application_id);
  return { ok: true, message: "Observación agregada." };
}

export async function requirementCheckAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("postulaciones:editar");
  if (auth.error !== null) return { error: auth.error };
  const parsed = z
    .object({
      application_id: z.uuid(),
      requirement_id: z.uuid(),
      status: z.enum(REQUIREMENT_CHECK_STATUSES),
      level_id: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
      note: z.string().trim().max(300).optional().transform((v) => v || null),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("set_requirement_check", {
    p_application_id: parsed.data.application_id,
    p_requirement_id: parsed.data.requirement_id,
    p_status: parsed.data.status,
    p_level_id: parsed.data.level_id,
    p_note: parsed.data.note,
  });
  if (error) return { error: dbErrorMessage(error) };
  refresh(null, parsed.data.application_id);
  return { ok: true, message: "Requisito evaluado." };
}

export async function syncStagesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const vacancy = z.uuid().safeParse(formData.get("vacancy_id"));
  if (!vacancy.success) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("sync_vacancy_stages", { p_vacancy_id: vacancy.data });
  if (error) return { error: dbErrorMessage(error) };
  refresh(vacancy.data);
  return { ok: true, message: "Etapas actualizadas desde el proceso de la vacante." };
}
