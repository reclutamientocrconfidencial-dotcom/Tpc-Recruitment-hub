"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import type { Permission } from "@/lib/auth/permissions";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, fieldErrorsFrom, formValues, type ActionState } from "@/lib/action-state";
import { documentExtension, safeFileName, validateDocument } from "@/lib/files";
import {
  assessmentResultSchema,
  assessmentTypeSchema,
  credentialSchema,
  credentialTypeSchema,
  interviewResultSchema,
  interviewScheduleSchema,
  questionBankSchema,
  templateSchema,
  vacancyAssessmentSchema,
} from "@/modules/evaluations/schema";
import { ASSESSMENT_STATUS, INTERVIEW_KIND, RECOMMENDATION } from "@/modules/labels";
import { RECOMMENDATIONS, type ReportSection } from "@/types/database";

const ADMIN_PATH = "/administracion/evaluaciones";

async function guard(permission: Permission) {
  const auth = await authorizeAction(permission);
  if (auth.error !== null) return { error: auth.error } as const;
  if (isDemoMode()) return { error: DEMO_READ_ONLY } as const;
  return { sb: await createSupabaseServerClient(), user: auth.user } as const;
}

function fail(error: { code?: string; message?: string }, tag: string, formData?: FormData): ActionState {
  console.warn(`[evaluations.${tag}]`, error.code);
  return { error: dbErrorMessage(error), values: formData ? formValues(formData) : undefined };
}

// ---------------------------------------------------------------------
// Catálogos (admin y coordinación)
// ---------------------------------------------------------------------
async function insertCatalog(table: string, schema: z.ZodType, formData: FormData, message: string): Promise<ActionState> {
  const g = await guard("configuracion:gestionar");
  if ("error" in g) return { error: g.error };
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  const { error } = await g.sb.from(table).insert(parsed.data as Record<string, unknown>);
  if (error) return error.code === "23505" ? { error: "Ya existe un registro con ese nombre.", values: formValues(formData) } : fail(error, table, formData);
  revalidatePath(ADMIN_PATH);
  return { ok: true, message };
}

export async function createQuestionAction(_p: ActionState, fd: FormData) {
  return insertCatalog("interview_questions", questionBankSchema, fd, "Pregunta agregada al banco.");
}
export async function createAssessmentTypeAction(_p: ActionState, fd: FormData) {
  return insertCatalog("assessment_types", assessmentTypeSchema, fd, "Tipo de evaluación agregado.");
}
export async function createCredentialTypeAction(_p: ActionState, fd: FormData) {
  return insertCatalog("credential_types", credentialTypeSchema, fd, "Tipo de credencial agregado.");
}

const TOGGLE_TABLES = ["interview_questions", "assessment_types", "credential_types"] as const;

export async function toggleEvaluationCatalogAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("configuracion:gestionar");
  if ("error" in g) return { error: g.error };
  const parsed = z.object({ table: z.enum(TOGGLE_TABLES), id: z.uuid(), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: "Datos inválidos." };
  const { error } = await g.sb.from(parsed.data.table).update({ is_active: parsed.data.active === "true" }).eq("id", parsed.data.id);
  if (error) return fail(error, "toggle");
  revalidatePath(ADMIN_PATH);
  return { ok: true, message: parsed.data.active === "true" ? "Activado." : "Desactivado." };
}

/** Nueva versión de la plantilla del informe (solo administración). La anterior queda en el historial. */
export async function createTemplateVersionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("plantillas:gestionar");
  if ("error" in g) return { error: g.error };
  const parsed = templateSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(fd) };
  const { data: created, error } = await g.sb.from("report_templates").insert({ ...parsed.data, is_active: false }).select("id").single();
  if (error) return fail(error, "template", fd);
  const off = await g.sb.from("report_templates").update({ is_active: false }).eq("is_active", true);
  const on = off.error ? off : await g.sb.from("report_templates").update({ is_active: true }).eq("id", created.id);
  if (on.error) return fail(on.error, "template.activate", fd);
  revalidatePath(ADMIN_PATH);
  return { ok: true, message: `Plantilla «${parsed.data.version}» vigente. Los informes ya creados conservan su plantilla.` };
}

// ---------------------------------------------------------------------
// Evaluaciones de la vacante
// ---------------------------------------------------------------------
export async function addVacancyAssessmentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("configuracion:gestionar");
  if ("error" in g) return { error: g.error };
  const parsed = vacancyAssessmentSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { error } = await g.sb.from("vacancy_assessments").upsert(parsed.data, { onConflict: "vacancy_id,assessment_type_id" });
  if (error) return fail(error, "vacancyAssessment");
  revalidatePath(`/vacantes/${parsed.data.vacancy_id}`);
  return { ok: true, message: "Evaluación de la vacante guardada." };
}

export async function removeVacancyAssessmentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("configuracion:gestionar");
  if ("error" in g) return { error: g.error };
  const parsed = z.object({ id: z.uuid(), vacancy_id: z.uuid() }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: "Datos inválidos." };
  const { error } = await g.sb.from("vacancy_assessments").delete().eq("id", parsed.data.id);
  if (error) return fail(error, "vacancyAssessment.remove");
  revalidatePath(`/vacantes/${parsed.data.vacancy_id}`);
  return { ok: true, message: "Evaluación quitada de la vacante." };
}

// ---------------------------------------------------------------------
// Entrevistas
// ---------------------------------------------------------------------
export async function scheduleInterviewAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("postulaciones:editar");
  if ("error" in g) return { error: g.error };
  const parsed = interviewScheduleSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(fd) };
  const { data, error } = await g.sb
    .from("interviews")
    .insert({ ...parsed.data, interviewer_id: parsed.data.interviewer_id ?? g.user.id })
    .select("id")
    .single();
  if (error) return fail(error, "schedule", fd);
  revalidatePath(`/postulaciones/${parsed.data.application_id}`);
  redirect(`/postulaciones/${parsed.data.application_id}/entrevistas/${data.id}?ok=creado`);
}

export async function interviewResultAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("postulaciones:editar");
  if ("error" in g) return { error: g.error };
  const parsed = interviewResultSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", values: formValues(fd) };
  const { id, ...rest } = parsed.data;
  // Notas por pregunta (campos notes_<n> y rating_<n>)
  const positions = [...fd.keys()].filter((k) => /^notes_\d+$/.test(k)).map((k) => Number(k.slice(6)));
  for (const pos of positions.slice(0, 60)) {
    const notes = String(fd.get(`notes_${pos}`) ?? "").trim().slice(0, 2000) || null;
    const r = Number(fd.get(`rating_${pos}`));
    const { error } = await g.sb
      .from("interview_answers")
      .update({ notes, rating: r >= 1 && r <= 5 ? r : null })
      .eq("interview_id", id)
      .eq("position", pos);
    if (error) return fail(error, "answers", fd);
  }
  const { data, error } = await g.sb.from("interviews").update(rest).eq("id", id).select("application_id").single();
  if (error) return fail(error, "result", fd);
  revalidatePath(`/postulaciones/${data.application_id}`);
  revalidatePath(`/postulaciones/${data.application_id}/entrevistas/${id}`);
  return { ok: true, message: "Entrevista guardada." };
}

// ---------------------------------------------------------------------
// Resultados de evaluaciones
// ---------------------------------------------------------------------
export async function saveAssessmentResultAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("postulaciones:editar");
  if ("error" in g) return { error: g.error };
  const parsed = assessmentResultSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { error } = await g.sb.from("assessment_results").upsert(parsed.data, { onConflict: "application_id,assessment_type_id" });
  if (error) return fail(error, "result");
  revalidatePath(`/postulaciones/${parsed.data.application_id}`);
  return { ok: true, message: "Resultado guardado." };
}

// ---------------------------------------------------------------------
// Credenciales (licencias, carnés, certificaciones)
// ---------------------------------------------------------------------
export async function addCredentialAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("candidatos:editar");
  if ("error" in g) return { error: g.error };
  const parsed = credentialSchema.safeParse(Object.fromEntries([...fd.entries()].filter(([k]) => k !== "file")));
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(fd) };
  const { verified, ...data } = parsed.data;
  let documentId: string | null = null;
  const file = fd.get("file");
  if (file instanceof File && file.size > 0) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateDocument(bytes);
    if (check.mime === null) return { error: check.error, values: formValues(fd) };
    const path = `candidatos/${data.candidate_id}/${crypto.randomUUID()}.${documentExtension(check.mime)}`;
    const up = await g.sb.storage.from("curriculums").upload(path, bytes, { contentType: check.mime, upsert: false });
    if (up.error) {
      console.warn("[credentials.upload]", up.error.message);
      return { error: "No fue posible cargar el archivo.", values: formValues(fd) };
    }
    const reg = await g.sb.rpc("register_candidate_file", {
      p_candidate_id: data.candidate_id,
      p_path: path,
      p_file_name: safeFileName(file.name),
      p_mime: check.mime,
      p_size: bytes.length,
      p_kind: "credencial",
    });
    if (reg.error) {
      await g.sb.storage.from("curriculums").remove([path]);
      return fail(reg.error, "credentials.register", fd);
    }
    documentId = reg.data as string;
  }
  const { error } = await g.sb.from("candidate_credentials").insert({ ...data, document_id: documentId, verified_at: verified ? new Date().toISOString() : null });
  if (error) return fail(error, "credentials", fd);
  revalidatePath(`/candidatos/${data.candidate_id}`);
  revalidatePath("/candidatos/vencimientos");
  return { ok: true, message: "Credencial registrada." };
}

export async function verifyCredentialAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("candidatos:editar");
  if ("error" in g) return { error: g.error };
  const parsed = z.object({ id: z.uuid(), candidate_id: z.uuid() }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: "Datos inválidos." };
  const { error } = await g.sb.from("candidate_credentials").update({ verified_at: new Date().toISOString() }).eq("id", parsed.data.id);
  if (error) return fail(error, "credentials.verify");
  revalidatePath(`/candidatos/${parsed.data.candidate_id}`);
  return { ok: true, message: "Credencial verificada." };
}

// ---------------------------------------------------------------------
// Informe ejecutivo
// ---------------------------------------------------------------------
/** Crea el borrador del informe con la plantilla vigente y datos ya registrados. */
export async function createReportAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("postulaciones:editar");
  if ("error" in g) return { error: g.error };
  const app = z.uuid().safeParse(fd.get("application_id"));
  if (!app.success) return { error: "Datos inválidos." };
  const { data: tpl } = await g.sb.from("report_templates").select("id, sections").eq("is_active", true).maybeSingle();
  if (!tpl) return { error: "No hay una plantilla de informe vigente. Contacte a administración." };
  const [{ data: results }, { data: interviews }] = await Promise.all([
    g.sb.from("assessment_results").select("status, score, notes, type:assessment_types(name, max_score), level:proficiency_levels(label)").eq("application_id", app.data),
    g.sb.from("interviews").select("kind, scheduled_at, recommendation, summary").eq("application_id", app.data).eq("status", "realizada").order("scheduled_at"),
  ]);
  type R = { status: keyof typeof ASSESSMENT_STATUS; score: number | null; notes: string | null; type: { name: string; max_score: number | null } | null; level: { label: string } | null };
  type I = { kind: keyof typeof INTERVIEW_KIND; scheduled_at: string; recommendation: keyof typeof RECOMMENDATION | null; summary: string | null };
  const content: Record<string, string> = {};
  for (const s of tpl.sections as ReportSection[]) content[s.key] = "";
  const evaluationsText = ((results ?? []) as unknown as R[])
    .map((r) => `• ${r.type?.name ?? "Evaluación"}: ${ASSESSMENT_STATUS[r.status].label}${r.level ? ` (nivel ${r.level.label})` : ""}${r.score != null ? ` · ${r.score}${r.type?.max_score ? ` de ${r.type.max_score}` : ""}` : ""}`)
    .join("\n");
  const interviewsText = ((interviews ?? []) as unknown as I[])
    .map((i) => `${INTERVIEW_KIND[i.kind]} (${new Date(i.scheduled_at).toLocaleDateString("es-CR", { timeZone: "America/Costa_Rica" })}): ${i.summary ?? ""}`.trim())
    .join("\n\n");
  // Prellenado: secciones cuya clave menciona evaluaciones o entrevista (cualquier versión de plantilla).
  for (const key of Object.keys(content)) {
    if (/evaluacion/.test(key)) content[key] = evaluationsText;
    else if (/entrevista/.test(key)) content[key] = interviewsText;
  }
  const { error } = await g.sb.from("executive_reports").insert({ application_id: app.data, template_id: tpl.id, content });
  if (error && error.code !== "23505") return fail(error, "report.create");
  redirect(`/postulaciones/${app.data}/informe`);
}

const reportSaveSchema = z.object({
  id: z.uuid(),
  application_id: z.uuid(),
  recommendation: z.union([z.literal(""), z.enum(RECOMMENDATIONS)]).optional().transform((v) => v || null),
  intent: z.enum(["guardar", "finalizar", "reabrir"]),
});

export async function saveReportAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("postulaciones:editar");
  if ("error" in g) return { error: g.error };
  const parsed = reportSaveSchema.safeParse(Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("s_"))));
  if (!parsed.success) return { error: "Datos inválidos." };
  const { id, application_id, recommendation, intent } = parsed.data;
  if (intent === "reabrir") {
    const { error } = await g.sb.from("executive_reports").update({ status: "borrador" }).eq("id", id);
    if (error) return fail(error, "report.reopen");
  } else {
    const content: Record<string, string> = {};
    for (const [k, v] of fd.entries()) {
      if (/^s_[a-z0-9_]{1,40}$/.test(k) && typeof v === "string") content[k.slice(2)] = v.trim().slice(0, 8000);
    }
    if (intent === "finalizar" && !recommendation) return { error: "Indique la recomendación antes de finalizar el informe.", values: formValues(fd) };
    const { error } = await g.sb
      .from("executive_reports")
      .update({ content, recommendation, ...(intent === "finalizar" ? { status: "final" } : {}) })
      .eq("id", id);
    if (error) return fail(error, "report.save", fd);
  }
  revalidatePath(`/postulaciones/${application_id}/informe`);
  revalidatePath(`/postulaciones/${application_id}`);
  return {
    ok: true,
    message: intent === "finalizar" ? "Informe finalizado. Ya puede exportarlo." : intent === "reabrir" ? "Informe reabierto como versión nueva." : "Borrador guardado.",
  };
}
