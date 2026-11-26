"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, type ActionState } from "@/lib/action-state";
import { AiProviderError } from "@/lib/ai/provider";
import { reidentify } from "@/lib/ai/pseudonymize";
import type { InterviewConclusions, Preselection } from "@/lib/ai/features";
import { discriminatoryReason, screenQuestions } from "@/lib/ai/guardrails";
import { candidateIdentifiers, executeFeature, latestCvProfile, profilePrompt, vacancyFacts, type Sb } from "@/modules/ai/engine";

async function guard() {
  const auth = await authorizeAction("postulaciones:editar");
  if (auth.error !== null) return { error: auth.error } as const;
  if (isDemoMode()) return { error: DEMO_READ_ONLY } as const;
  return { sb: await createSupabaseServerClient() } as const;
}

async function interviewOf(sb: Sb, id: string) {
  const { data } = await sb.from("interviews").select("id, application_id, status, summary").eq("id", id).maybeSingle();
  return data as { id: string; application_id: string; status: string; summary: string | null } | null;
}

function refresh(applicationId: string, interviewId: string) {
  revalidatePath(`/postulaciones/${applicationId}/entrevistas/${interviewId}`);
  revalidatePath(`/postulaciones/${applicationId}`);
}

const optStr = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const questionSchema = z.object({
  interview_id: z.uuid(),
  position: z.coerce.number().int().min(1).max(60).optional(),
  text: z.string().trim().min(5, "Escriba la pregunta (mínimo 5 caracteres).").max(500, "Máximo 500 caracteres."),
  competency: optStr(80),
  objective: optStr(300),
});

/** Agrega o edita una pregunta del guion (solo entrevistas programadas). Bloquea temas discriminatorios. */
export async function saveQuestionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const parsed = questionSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const q = parsed.data;
  const reason = discriminatoryReason(q.text);
  if (reason) return { error: `La pregunta toca un tema no permitido (${reason}). Reformúlela sobre competencias laborales.` };
  const iv = await interviewOf(g.sb, q.interview_id);
  if (!iv) return { error: "No se encontró la entrevista." };
  if (iv.status !== "programada") return { error: "El guion solo se modifica mientras la entrevista está programada." };
  if (q.position) {
    const { error } = await g.sb.from("interview_answers").update({ question_text: q.text, competency: q.competency, objective: q.objective }).eq("interview_id", iv.id).eq("position", q.position);
    if (error) return { error: dbErrorMessage(error) };
  } else {
    const { data: rows } = await g.sb.from("interview_answers").select("position, question_text").eq("interview_id", iv.id);
    const existing = (rows ?? []) as Array<{ position: number; question_text: string }>;
    if (screenQuestions([{ texto: q.text }], existing.map((r) => r.question_text)).kept.length === 0) return { error: "Esa pregunta ya está en el guion." };
    const next = Math.max(0, ...existing.map((r) => r.position)) + 1;
    if (next > 60) return { error: "El guion admite hasta 60 preguntas." };
    const { error } = await g.sb.from("interview_answers").insert({ interview_id: iv.id, position: next, question_text: q.text, competency: q.competency, objective: q.objective, origin: "manual" });
    if (error) return { error: dbErrorMessage(error) };
  }
  refresh(iv.application_id, iv.id);
  return { ok: true, message: q.position ? "Pregunta actualizada." : "Pregunta agregada al guion." };
}

export async function deleteQuestionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const p = z.object({ interview_id: z.uuid(), position: z.coerce.number().int().min(1).max(60) }).safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return { error: "Datos inválidos." };
  const iv = await interviewOf(g.sb, p.data.interview_id);
  if (!iv || iv.status !== "programada") return { error: "El guion solo se modifica mientras la entrevista está programada." };
  const { error, count } = await g.sb.from("interview_answers").delete({ count: "exact" }).eq("interview_id", iv.id).eq("position", p.data.position);
  if (error) return { error: dbErrorMessage(error) };
  if (!count) return { error: "No se pudo quitar la pregunta." };
  refresh(iv.application_id, iv.id);
  return { ok: true, message: "Pregunta quitada." };
}

/** Guion personalizado: CV, funciones y requisitos de la vacante, y pendientes de la preselección. */
export async function generateQuestionsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const id = z.uuid().safeParse(fd.get("interview_id"));
  if (!id.success) return { error: "Datos inválidos." };
  const iv = await interviewOf(g.sb, id.data);
  if (!iv || iv.status !== "programada") return { error: "Solo se prepara el guion de una entrevista programada." };
  try {
    const { data: a } = await g.sb.from("applications").select("vacancy_id, candidate_id").eq("id", iv.application_id).single();
    const [{ v, reqs }, { ids }, cv, { data: checks }, { data: screening }, { data: rows }] = await Promise.all([
      vacancyFacts(g.sb, a!.vacancy_id),
      candidateIdentifiers(g.sb, a!.candidate_id),
      latestCvProfile(g.sb, a!.candidate_id),
      g.sb.from("application_requirement_checks").select("requirement_id, status").eq("application_id", iv.application_id),
      g.sb.from("ai_requests").select("output").eq("application_id", iv.application_id).eq("feature", "preseleccion").in("status", ["pendiente_revision", "aceptado"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      g.sb.from("interview_answers").select("question_text").eq("interview_id", iv.id),
    ]);
    const status = new Map(((checks ?? []) as Array<{ requirement_id: string; status: string }>).map((c) => [c.requirement_id, c.status]));
    const requirements = reqs.filter((r) => status.get(r.id) !== "no_aplica").map((r) => ({ name: r.requirement, type: r.requirement_type, status: status.get(r.id) }));
    const pending = ((screening?.output as Preselection | undefined)?.explorar_en_entrevista ?? []).slice(0, 8);
    const prompt = [
      `Vacante: ${v.title}${v.position ? ` (puesto: ${v.position.name})` : ""}`,
      v.description ? `Funciones del puesto: ${v.description}` : "",
      `Requisitos del cliente:\n${requirements.map((r) => `- ${r.name} (${r.type}${r.status === "cumple" ? ", ya verificado" : ""})`).join("\n") || "- Sin requisitos"}`,
      cv ? `Perfil curricular de [CANDIDATO]:\n${profilePrompt(cv.profile)}` : "Sin perfil curricular disponible.",
      pending.length ? `Aspectos pendientes de verificar:\n${pending.map((p) => `- ${p}`).join("\n")}` : "",
      `Preguntas que YA están en el guion (no las repitas):\n${((rows ?? []) as Array<{ question_text: string }>).map((r) => `- ${r.question_text}`).join("\n") || "- Ninguna"}`,
    ].filter(Boolean).join("\n\n");
    const r = await executeFeature(g.sb, {
      feature: "preguntas_entrevista",
      prompt,
      sim: { requirements, profile: cv?.profile ?? null, vacancyTitle: v.title, vacancyDescription: v.description, pending },
      ids,
      subject: { application_id: iv.application_id },
      tag: { interview_id: iv.id },
    });
    refresh(iv.application_id, iv.id);
    return { ok: true, message: r.reused ? "Se reutilizó una propuesta anterior." : "Propuesta lista: elija qué preguntas agregar al guion." };
  } catch (err) {
    if (!(err instanceof AiProviderError)) console.error("[interviews.questions]", err);
    return { error: err instanceof AiProviderError ? err.message : "No fue posible preparar las preguntas." };
  }
}

/** Agrega al guion las preguntas propuestas que el reclutador marcó (revisión humana). */
export async function acceptQuestionsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const p = z.object({ id: z.uuid(), interview_id: z.uuid() }).safeParse({ id: fd.get("id"), interview_id: fd.get("interview_id") });
  if (!p.success) return { error: "Datos inválidos." };
  const picked = new Set([...fd.keys()].filter((k) => /^q_\d+$/.test(k)).map((k) => Number(k.slice(2))));
  if (!picked.size) return { error: "Marque al menos una pregunta." };
  const iv = await interviewOf(g.sb, p.data.interview_id);
  if (!iv || iv.status !== "programada") return { error: "El guion solo se modifica mientras la entrevista está programada." };
  const { data: req } = await g.sb.from("ai_requests").select("id, status, feature, interview_id, output").eq("id", p.data.id).maybeSingle();
  if (!req || req.feature !== "preguntas_entrevista" || req.interview_id !== iv.id || !["pendiente_revision", "aceptado"].includes(req.status)) return { error: "La propuesta ya no está disponible." };
  const proposals = ((req.output as { preguntas?: Array<{ texto: string; competencia: string; objetivo: string; fundamento: string }> }).preguntas ?? []).filter((_, i) => picked.has(i));
  const { data: rows } = await g.sb.from("interview_answers").select("position, question_text").eq("interview_id", iv.id);
  const existing = (rows ?? []) as Array<{ position: number; question_text: string }>;
  const { kept, removed } = screenQuestions(proposals, existing.map((r) => r.question_text));
  const { name } = await candidateIdentifiers(g.sb, (await g.sb.from("applications").select("candidate_id").eq("id", iv.application_id).single()).data!.candidate_id);
  let next = Math.max(0, ...existing.map((r) => r.position));
  const insert = kept.slice(0, Math.max(0, 60 - next)).map((q) => ({
    interview_id: iv.id,
    position: ++next,
    question_text: reidentify(q.texto, name.split(" ")[0] ?? "").slice(0, 500),
    competency: q.competencia.slice(0, 80) || null,
    objective: q.objetivo.slice(0, 300) || null,
    guidance: q.fundamento ? `Fundamento: ${q.fundamento}`.slice(0, 500) : null,
    origin: "ia",
  }));
  if (insert.length) {
    const { error } = await g.sb.from("interview_answers").insert(insert);
    if (error) return { error: dbErrorMessage(error) };
  }
  if (req.status === "pendiente_revision") await g.sb.rpc("ai_review_request", { p_id: req.id, p_decision: "aceptado" });
  refresh(iv.application_id, iv.id);
  return { ok: true, message: `${insert.length} pregunta(s) agregada(s).${removed.length ? ` Se omitieron ${removed.length}: ${removed.map((r) => r.motivo).join(", ")}.` : ""}` };
}

/** Organiza las respuestas registradas: resumen, evidencias, fortalezas y aspectos por validar. */
export async function generateConclusionsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const id = z.uuid().safeParse(fd.get("interview_id"));
  if (!id.success) return { error: "Datos inválidos." };
  const iv = await interviewOf(g.sb, id.data);
  if (!iv) return { error: "No se encontró la entrevista." };
  try {
    const { data: rows } = await g.sb.from("interview_answers").select("position, question_text, competency, notes, rating").eq("interview_id", iv.id).order("position");
    const answers = ((rows ?? []) as Array<{ question_text: string; competency: string | null; notes: string | null; rating: number | null }>).map((r) => ({ question: r.question_text, competency: r.competency, notes: r.notes, rating: r.rating }));
    if (!answers.some((a) => a.notes?.trim())) return { error: "Registre y guarde notas de al menos una respuesta antes de pedir conclusiones." };
    const { data: a } = await g.sb.from("applications").select("vacancy_id, candidate_id").eq("id", iv.application_id).single();
    const [{ v }, { ids }] = await Promise.all([vacancyFacts(g.sb, a!.vacancy_id), candidateIdentifiers(g.sb, a!.candidate_id)]);
    const prompt = `Vacante: ${v.title}\n\nNotas del reclutador por pregunta (entrevista a [CANDIDATO]):\n${answers
      .map((x, i) => `${i + 1}. ${x.question}${x.competency ? ` [${x.competency}]` : ""}\n   Calificación: ${x.rating ?? "sin calificar"}/5\n   Notas: ${x.notes?.trim() || "(sin respuesta registrada)"}`)
      .join("\n")}`;
    await executeFeature(g.sb, { feature: "conclusiones_entrevista", prompt, sim: { answers }, ids, subject: { application_id: iv.application_id }, tag: { interview_id: iv.id } });
    refresh(iv.application_id, iv.id);
    return { ok: true, message: "Borrador de conclusiones listo. Revíselo antes de usarlo." };
  } catch (err) {
    if (!(err instanceof AiProviderError)) console.error("[interviews.conclusions]", err);
    return { error: err instanceof AiProviderError ? err.message : "No fue posible preparar las conclusiones." };
  }
}

/** Acepta las conclusiones y completa el resumen de la entrevista SOLO si está vacío. */
export async function applyConclusionsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const p = z.object({ id: z.uuid(), interview_id: z.uuid() }).safeParse({ id: fd.get("id"), interview_id: fd.get("interview_id") });
  if (!p.success) return { error: "Datos inválidos." };
  const iv = await interviewOf(g.sb, p.data.interview_id);
  if (!iv) return { error: "No se encontró la entrevista." };
  const { data: req } = await g.sb.from("ai_requests").select("id, status, feature, interview_id, output").eq("id", p.data.id).maybeSingle();
  if (!req || req.feature !== "conclusiones_entrevista" || req.interview_id !== iv.id || !["pendiente_revision", "aceptado"].includes(req.status)) return { error: "El borrador ya no está disponible." };
  if (iv.summary?.trim()) return { error: "La entrevista ya tiene resumen: copie manualmente lo que considere útil." };
  const c = req.output as InterviewConclusions;
  const { name } = await candidateIdentifiers(g.sb, (await g.sb.from("applications").select("candidate_id").eq("id", iv.application_id).single()).data!.candidate_id);
  const block = (t: string, xs: string[]) => (xs.length ? `\n\n${t}:\n${xs.map((x) => `• ${x}`).join("\n")}` : "");
  const summary = reidentify(`${c.resumen}${block("Evidencias", c.evidencias)}${block("Fortalezas", c.fortalezas)}${block("Aspectos por validar", c.aspectos_por_validar)}\n\nConclusión: ${c.conclusion}`, name).slice(0, 4000);
  const { error } = await g.sb.from("interviews").update({ summary }).eq("id", iv.id);
  if (error) return { error: dbErrorMessage(error) };
  if (req.status === "pendiente_revision") await g.sb.rpc("ai_review_request", { p_id: req.id, p_decision: "aceptado" });
  refresh(iv.application_id, iv.id);
  return { ok: true, message: "Resumen completado. Revíselo y ajústelo antes de guardar la entrevista." };
}
