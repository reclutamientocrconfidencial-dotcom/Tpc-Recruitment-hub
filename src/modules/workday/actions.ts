"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, fieldErrorsFrom, formValues, type ActionState } from "@/lib/action-state";
import { crLocalToIso } from "@/modules/evaluations/schema";
import { TASK_KINDS } from "@/types/database";

const optUuid = z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || null);

const taskSchema = z.object({
  title: z.string().trim().min(3, "Tarea: mínimo 3 caracteres.").max(200, "Tarea: máximo 200 caracteres."),
  kind: z.enum(TASK_KINDS),
  due_at: z
    .string()
    .transform((v) => crLocalToIso(v))
    .refine((v) => v !== null, "Indique fecha y hora."),
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
  assigned_to: optUuid,
  client_id: optUuid,
  vacancy_id: optUuid,
  application_id: optUuid,
});

export async function createTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("jornada:ver");
  if (auth.error !== null) return { error: auth.error };
  const parsed = taskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("tasks").insert({ ...parsed.data, assigned_to: parsed.data.assigned_to ?? auth.user.id });
  if (error) {
    console.warn("[tasks.create]", error.code);
    return { error: error.code === "42501" ? "Solo coordinación o administración asignan tareas a otras personas." : dbErrorMessage(error), values: formValues(formData) };
  }
  revalidatePath("/mi-jornada");
  return { ok: true, message: "Tarea agregada." };
}

export async function setTaskStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("jornada:ver");
  if (auth.error !== null) return { error: auth.error };
  const parsed = z.object({ id: z.uuid(), status: z.enum(["hecha", "cancelada", "pendiente"]) }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("tasks").update({ status: parsed.data.status }).eq("id", parsed.data.id).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "La tarea no existe o no tiene acceso a ella." };
  revalidatePath("/mi-jornada");
  return { ok: true, message: parsed.data.status === "hecha" ? "Tarea completada." : "Tarea actualizada." };
}

/** Crea o renueva el enlace secreto de calendario; el token se muestra una sola vez. */
export async function rotateCalendarAction(): Promise<ActionState> {
  const auth = await authorizeAction("jornada:ver");
  if (auth.error !== null) return { error: auth.error };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("rotate_calendar_token");
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/mi-jornada");
  return { ok: true, message: "Enlace generado. Cópielo ahora: por seguridad no se volverá a mostrar.", values: { token: String(data) } };
}

export async function revokeCalendarAction(): Promise<ActionState> {
  const auth = await authorizeAction("jornada:ver");
  if (auth.error !== null) return { error: auth.error };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("revoke_calendar_token");
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/mi-jornada");
  return { ok: true, message: "Enlace de calendario revocado." };
}
