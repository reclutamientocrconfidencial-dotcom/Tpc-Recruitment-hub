"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, fieldErrorsFrom, formValues, type ActionState } from "@/lib/action-state";
import { cvExtension, safeFileName, validateCv } from "@/lib/files";
import { formSchema, linkSchema, questionSchema } from "@/modules/intake/schema";

function refreshForm(formId?: string) {
  revalidatePath("/recepcion/formularios");
  if (formId) revalidatePath(`/recepcion/formularios/${formId}`);
}

export async function createFormAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("formularios:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const parsed = formSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("public_forms").insert(parsed.data).select("id").single();
  if (error) {
    console.warn("[intake.createForm]", error.code);
    return { error: error.code === "23505" ? "Esa vacante ya tiene un formulario." : dbErrorMessage(error), values: formValues(formData) };
  }
  refreshForm();
  redirect(`/recepcion/formularios/${data.id}?ok=creado`);
}

export async function updateFormAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("formularios:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = formSchema.omit({ vacancy_id: true }).safeParse(Object.fromEntries(formData.entries()));
  if (!id.success) return { error: "Datos inválidos." };
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("public_forms").update(parsed.data).eq("id", id.data);
  if (error) return { error: dbErrorMessage(error) };
  refreshForm(id.data);
  return { ok: true, message: "Formulario actualizado." };
}

const toggleSchema = z.object({ id: z.uuid(), form_id: z.uuid(), active: z.enum(["true", "false"]) });

async function toggle(table: "public_forms" | "form_questions" | "form_links", formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("formularios:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const parsed = toggleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const active = parsed.data.active === "true";
  const { error } = await sb.from(table).update({ is_active: active }).eq("id", parsed.data.id);
  if (error) return { error: dbErrorMessage(error) };
  refreshForm(parsed.data.form_id);
  return { ok: true, message: active ? "Activado." : "Desactivado." };
}

export async function toggleFormAction(_prev: ActionState, formData: FormData) {
  return toggle("public_forms", formData);
}
export async function toggleQuestionAction(_prev: ActionState, formData: FormData) {
  return toggle("form_questions", formData);
}
export async function toggleLinkAction(_prev: ActionState, formData: FormData) {
  return toggle("form_links", formData);
}

export async function addQuestionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("formularios:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const parsed = questionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data: last } = await sb.from("form_questions").select("position").eq("form_id", parsed.data.form_id).order("position", { ascending: false }).limit(1);
  const position = ((last?.[0] as { position: number } | undefined)?.position ?? 0) + 1;
  if (position > 30) return { error: "Máximo 30 preguntas por formulario." };
  const { error } = await sb.from("form_questions").insert({ ...parsed.data, position });
  if (error) return { error: dbErrorMessage(error), values: formValues(formData) };
  refreshForm(parsed.data.form_id);
  return { ok: true, message: "Pregunta agregada." };
}

export async function createLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("formularios:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const parsed = linkSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("form_links").insert(parsed.data);
  if (error) return { error: dbErrorMessage(error) };
  refreshForm(parsed.data.form_id);
  return { ok: true, message: "Enlace creado." };
}

const reviewSchema = z.object({
  submission_id: z.uuid(),
  decision: z.enum(["vincular", "crear", "descartar"], { error: "Seleccione una decisión." }),
  candidate_id: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || null),
  note: z.string().trim().max(300, "Nota: máximo 300 caracteres.").optional().transform((v) => v || null),
});

/** Resolución humana de un envío con posibles duplicados. */
export async function reviewSubmissionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("recepcion:ver");
  if (auth.error !== null) return { error: auth.error };
  if (!can(auth.user.role, "candidatos:editar")) return { error: "No tiene permiso para realizar esta acción." };
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("review_submission", {
    p_submission_id: parsed.data.submission_id,
    p_decision: parsed.data.decision,
    p_candidate_id: parsed.data.candidate_id,
    p_note: parsed.data.note,
  });
  if (error) {
    console.warn("[intake.review]", error.code);
    return { error: dbErrorMessage(error) };
  }
  if (parsed.data.decision === "descartar") {
    // Minimización: el currículum de un envío descartado también se elimina.
    const { data: sub } = await sb.from("intake_submissions").select("cv_path").eq("id", parsed.data.submission_id).maybeSingle();
    const path = (sub as { cv_path: string | null } | null)?.cv_path;
    if (path) {
      const rm = await sb.storage.from("curriculums").remove([path]);
      if (rm.error) console.warn("[intake.discard.cv]", rm.error.message);
    }
  }
  revalidatePath("/recepcion");
  revalidatePath(`/recepcion/${parsed.data.submission_id}`);
  if (data) revalidatePath(`/candidatos/${data as string}`);
  return { ok: true, message: parsed.data.decision === "descartar" ? "Envío descartado: sus datos personales se eliminaron." : "Envío incorporado a la base de candidatos." };
}

/** Carga de un currículum por el personal desde la ficha del candidato. */
export async function uploadCandidateDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("candidatos:editar");
  if (auth.error !== null) return { error: auth.error };
  const candidate = z.uuid().safeParse(formData.get("candidate_id"));
  if (!candidate.success) return { error: "Datos inválidos." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Seleccione el archivo." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateCv(bytes);
  if (check.mime === null) return { error: check.error };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const path = `candidatos/${candidate.data}/${crypto.randomUUID()}.${cvExtension(check.mime)}`;
  const up = await sb.storage.from("curriculums").upload(path, bytes, { contentType: check.mime, upsert: false });
  if (up.error) {
    console.warn("[documents.upload]", up.error.message);
    return { error: "No fue posible cargar el archivo. Verifique que puede editar este candidato." };
  }
  const { error } = await sb.rpc("register_candidate_document", {
    p_candidate_id: candidate.data,
    p_path: path,
    p_file_name: safeFileName(file.name),
    p_mime: check.mime,
    p_size: bytes.length,
  });
  if (error) {
    await sb.storage.from("curriculums").remove([path]);
    return { error: dbErrorMessage(error) };
  }
  revalidatePath(`/candidatos/${candidate.data}`);
  return { ok: true, message: "Currículum cargado." };
}
