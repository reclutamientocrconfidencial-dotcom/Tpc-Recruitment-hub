"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, fieldErrorsFrom, type ActionState } from "@/lib/action-state";

const consentTextSchema = z.object({
  version: z.string().trim().min(1, "Indique la versión.").max(30),
  title: z.string().trim().min(3, "Indique el título.").max(150),
  body: z.string().trim().min(20, "El texto debe tener al menos 20 caracteres.").max(20000),
});

/** Nueva versión del consentimiento (queda inactiva hasta publicarla). Solo admin. */
export async function createConsentTextAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("usuarios:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const parsed = consentTextSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("consent_texts").insert({ ...parsed.data, is_active: false });
  if (error) return { error: error.code === "23505" ? "Ya existe esa versión." : dbErrorMessage(error) };
  revalidatePath("/administracion/consentimientos");
  return { ok: true, message: `Versión ${parsed.data.version} creada (sin publicar).` };
}

/** Publica una versión: pasa a ser la vigente para nuevos consentimientos. */
export async function activateConsentTextAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("usuarios:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error: e1 } = await sb.from("consent_texts").update({ is_active: false }).eq("is_active", true).neq("id", id.data);
  if (e1) return { error: dbErrorMessage(e1) };
  const { data, error } = await sb.from("consent_texts").update({ is_active: true }).eq("id", id.data).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tiene permiso para publicar versiones." };
  revalidatePath("/administracion/consentimientos");
  return { ok: true, message: "Versión publicada como vigente." };
}

/** Registra la aprobación jurídica de una versión (requisito para datos reales). */
export async function approveConsentTextAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("usuarios:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const id = z.uuid().safeParse(formData.get("id"));
  const note = z.string().trim().min(5, "Indique quién aprobó y cuándo (mínimo 5 caracteres).").max(500).safeParse(formData.get("legal_note"));
  if (!id.success) return { error: "Datos inválidos." };
  if (!note.success) return { error: note.error.issues[0]?.message ?? "Nota inválida." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("consent_texts").update({ legal_approved: true, legal_note: note.data }).eq("id", id.data).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tiene permiso." };
  revalidatePath("/administracion/consentimientos");
  return { ok: true, message: "Aprobación jurídica registrada." };
}
