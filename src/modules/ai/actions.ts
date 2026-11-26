"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, type ActionState } from "@/lib/action-state";
import type { SimInput } from "@/lib/ai/features";
import { reidentify, type Identifiers } from "@/lib/ai/pseudonymize";
import { AiProviderError } from "@/lib/ai/provider";
import { ALLOWED_MODELS } from "@/lib/ai/pricing";
import { candidateIdentifiers, executeFeature, latestCvProfile, profilePrompt, vacancyFacts, type Sb } from "@/modules/ai/engine";
import { ASSESSMENT_STATUS, INTERVIEW_KIND, REQUIREMENT_CHECK } from "@/modules/labels";
import type { ReportSection } from "@/types/database";

type Built = { prompt: string; sim: SimInput; ids: Identifiers; subject: { candidate_id?: string; vacancy_id?: string; application_id?: string } };

const runSchema = z.object({
  // Funciones de uso general; la lectura de CV, la preselección y las entrevistas tienen sus propias acciones.
  feature: z.enum(["comparar", "preguntas", "borrador_informe", "publicacion"]),
  candidate_id: z.uuid().optional(),
  vacancy_id: z.uuid().optional(),
  application_id: z.uuid().optional(),
});

async function build(sb: Sb, f: z.infer<typeof runSchema>): Promise<Built> {
  switch (f.feature) {
    case "preguntas":
    case "publicacion": {
      if (!f.vacancy_id) throw new AiProviderError("Datos inválidos.");
      const { v, reqs } = await vacancyFacts(sb, f.vacancy_id);
      const prompt = [
        `Vacante: ${v.title}${v.position ? ` (puesto: ${v.position.name})` : ""}`,
        v.description ? `Descripción: ${v.description}` : "",
        `Ubicación: ${[v.province, v.location_detail].filter(Boolean).join(", ") || "sin indicar"} · Modalidad: ${v.modality ?? "sin indicar"} · Jornada: ${v.work_schedule ?? v.employment_type ?? "sin indicar"}`,
        `Requisitos:\n${reqs.map((r) => `- ${r.requirement} (${r.requirement_type}${r.min_level ? `, mínimo ${r.min_level.label}` : ""})`).join("\n") || "- Sin requisitos configurados"}`,
      ].filter(Boolean).join("\n");
      return {
        prompt,
        sim: { vacancyTitle: v.title, vacancyDescription: v.description, location: v.province, modality: v.modality, requirements: reqs.map((r) => ({ name: r.requirement, type: r.requirement_type })) },
        ids: {},
        subject: { vacancy_id: f.vacancy_id },
      };
    }
    case "comparar":
    case "borrador_informe": {
      if (!f.application_id) throw new AiProviderError("Datos inválidos.");
      const { data: a } = await sb.from("applications").select("id, vacancy_id, candidate_id, candidate:candidates(current_title, years_experience, english_level, profiles:candidate_profiles(position:job_positions(name)))").eq("id", f.application_id).maybeSingle();
      if (!a) throw new AiProviderError("No se encontró la postulación o no tiene acceso a ella.");
      type A = { vacancy_id: string; candidate_id: string; candidate: { current_title: string | null; years_experience: number | null; english_level: string | null; profiles: Array<{ position: { name: string } | null }> } | null };
      const app = a as unknown as A;
      const [{ v, reqs }, { ids }, { data: checks }, { data: results }, { data: interviews }] = await Promise.all([
        vacancyFacts(sb, app.vacancy_id),
        candidateIdentifiers(sb, app.candidate_id),
        sb.from("application_requirement_checks").select("requirement_id, status, note, level:proficiency_levels(label)").eq("application_id", f.application_id),
        sb.from("assessment_results").select("status, score, notes, type:assessment_types(name, max_score), level:proficiency_levels(label)").eq("application_id", f.application_id),
        sb.from("interviews").select("kind, rating, recommendation, summary").eq("application_id", f.application_id).eq("status", "realizada"),
      ]);
      type C = { requirement_id: string; status: keyof typeof REQUIREMENT_CHECK; note: string | null; level: { label: string } | null };
      type Res = { status: keyof typeof ASSESSMENT_STATUS; score: number | null; notes: string | null; type: { name: string; max_score: number | null } | null; level: { label: string } | null };
      type I = { kind: keyof typeof INTERVIEW_KIND; rating: number | null; recommendation: string | null; summary: string | null };
      const checkBy = new Map(((checks ?? []) as unknown as C[]).map((c) => [c.requirement_id, c]));
      const reqLines = reqs.map((r) => {
        const c = checkBy.get(r.id);
        return `- ${r.requirement} (${r.requirement_type}${r.min_level ? `, mínimo ${r.min_level.label}` : ""}): ${c ? REQUIREMENT_CHECK[c.status].label : "Pendiente"}${c?.level ? `, nivel ${c.level.label}` : ""}${c?.note ? ` — ${c.note}` : ""}`;
      });
      const resLines = ((results ?? []) as unknown as Res[]).map((r) => `- ${r.type?.name}: ${ASSESSMENT_STATUS[r.status].label}${r.level ? `, nivel ${r.level.label}` : ""}${r.score != null ? `, ${r.score}${r.type?.max_score ? `/${r.type.max_score}` : ""}` : ""}${r.notes ? ` — ${r.notes}` : ""}`);
      const intLines = ((interviews ?? []) as unknown as I[]).map((i) => `- Entrevista ${INTERVIEW_KIND[i.kind]}${i.rating ? ` (${i.rating}/5)` : ""}${i.recommendation ? `, ${i.recommendation}` : ""}: ${i.summary ?? ""}`);
      const cand = app.candidate;
      const profile = [
        `Puesto actual: ${cand?.current_title ?? "sin indicar"}`,
        `Años de experiencia: ${cand?.years_experience ?? "sin indicar"}`,
        `Inglés: ${cand?.english_level ?? "sin indicar"}`,
        `Perfiles: ${(cand?.profiles ?? []).map((p) => p.position?.name).filter(Boolean).join(", ") || "sin indicar"}`,
      ].join("\n");
      let prompt = `Vacante: ${v.title}${v.description ? `\nDescripción: ${v.description}` : ""}\n\nPerfil de [CANDIDATO]:\n${profile}\n\nRequisitos y evaluación:\n${reqLines.join("\n") || "- Sin requisitos"}\n\nPruebas:\n${resLines.join("\n") || "- Sin pruebas registradas"}\n\nEntrevistas:\n${intLines.join("\n") || "- Sin entrevistas realizadas"}`;
      let sections: ReportSection[] = [];
      if (f.feature === "borrador_informe") {
        // Solo información validada: el perfil curricular se usa únicamente si está CONFIRMADO.
        const cv = await latestCvProfile(sb, app.candidate_id);
        if (cv?.confirmed) prompt += `\n\nPerfil curricular confirmado:\n${profilePrompt(cv.profile)}`;
        prompt += "\n\nUse SOLO la información anterior (validada por el reclutador). Si un apartado no tiene datos, devuelva el texto vacío.";
        const { data: rep } = await sb.from("executive_reports").select("status, template:report_templates(sections)").eq("application_id", f.application_id).maybeSingle();
        const r = rep as unknown as { status: string; template: { sections: ReportSection[] } | null } | null;
        if (!r || r.status !== "borrador" || !r.template) throw new AiProviderError("Cree el informe ejecutivo (en borrador) antes de pedir un borrador con IA.");
        sections = r.template.sections;
        prompt += `\n\nSecciones a redactar (clave: título — guía):\n${sections.map((s) => `- ${s.key}: ${s.title}${s.help ? ` — ${s.help}` : ""}`).join("\n")}`;
      }
      return {
        prompt,
        sim: {
          requirements: reqs.map((r) => ({ name: r.requirement, type: r.requirement_type, status: checkBy.get(r.id)?.status })),
          sections,
          facts: [...resLines, ...intLines].map((l) => l.replace(/^- /, "")),
        },
        ids,
        subject: { application_id: f.application_id },
      };
    }
  }
}

function refresh(subject: Built["subject"]) {
  if (subject.application_id) revalidatePath(`/postulaciones/${subject.application_id}`);
  if (subject.vacancy_id) revalidatePath(`/vacantes/${subject.vacancy_id}`);
  if (subject.candidate_id) revalidatePath(`/candidatos/${subject.candidate_id}`);
}

/** Ejecuta una función de IA. El resultado queda «pendiente de revisión»: nada se aplica solo. */
export async function runAiAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("postulaciones:editar");
  if (auth.error !== null) return { error: auth.error };
  const parsed = runSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  try {
    const built = await build(sb, parsed.data);
    const r = await executeFeature(sb, { feature: parsed.data.feature, ...built, reuse: parsed.data.feature === "comparar" });
    refresh(built.subject);
    return { ok: true, message: r.reused ? "Ya existía un resultado con la misma información: se reutilizó sin costo." : "Resultado listo. Revíselo antes de usarlo." };
  } catch (err) {
    if (!(err instanceof AiProviderError)) console.error("[ai.run]", err);
    return { error: err instanceof AiProviderError ? err.message : "No fue posible completar la consulta de IA." };
  }
}

const reviewSchema = z.object({ id: z.uuid(), decision: z.enum(["aceptado", "descartado"]), path: z.string().regex(/^\/[a-z0-9/-]{1,120}$/) });

/** Revisión humana obligatoria. */
export async function reviewAiAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("postulaciones:editar");
  if (auth.error !== null) return { error: auth.error };
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("ai_review_request", { p_id: parsed.data.id, p_decision: parsed.data.decision });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(parsed.data.path);
  return { ok: true, message: parsed.data.decision === "aceptado" ? "Resultado aceptado." : "Resultado descartado y eliminado." };
}

/** Aplica un borrador ACEPTADO al informe: solo completa secciones vacías (nunca sobrescribe lo escrito). */
export async function applyReportDraftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("postulaciones:editar");
  if (auth.error !== null) return { error: auth.error };
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data: req } = await sb.from("ai_requests").select("status, feature, application_id, output").eq("id", id.data).maybeSingle();
  if (!req || req.status !== "aceptado" || req.feature !== "borrador_informe" || !req.application_id) return { error: "Solo se aplica un borrador aceptado." };
  const { data: rep } = await sb.from("executive_reports").select("id, status, content").eq("application_id", req.application_id).maybeSingle();
  if (!rep || rep.status !== "borrador") return { error: "El informe no está en borrador." };
  const { name } = await candidateIdentifiers(sb, (await sb.from("applications").select("candidate_id").eq("id", req.application_id).single()).data!.candidate_id);
  const content = { ...(rep.content as Record<string, string>) };
  let filled = 0;
  for (const s of (req.output as { secciones: Array<{ clave: string; texto: string }> }).secciones ?? []) {
    if (s.clave in content && !content[s.clave]?.trim()) {
      content[s.clave] = reidentify(s.texto, name).slice(0, 8000);
      filled++;
    }
  }
  const { error } = await sb.from("executive_reports").update({ content }).eq("id", rep.id);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/postulaciones/${req.application_id}/informe`);
  return { ok: true, message: filled ? `Se completaron ${filled} sección(es) vacía(s). Revise el informe.` : "No había secciones vacías: no se cambió nada." };
}

/** Agrega al banco las preguntas ACEPTADAS (administración y coordinación). */
export async function addAiQuestionsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error !== null) return { error: auth.error };
  if (!can(auth.user.role, "configuracion:gestionar")) return { error: "No tiene permiso para realizar esta acción." };
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data: req } = await sb.from("ai_requests").select("status, feature, vacancy_id, output").eq("id", id.data).maybeSingle();
  if (!req || req.status !== "aceptado" || req.feature !== "preguntas" || !req.vacancy_id) return { error: "Solo se agregan preguntas aceptadas." };
  const { data: v } = await sb.from("vacancies").select("position_id").eq("id", req.vacancy_id).single();
  const rows = ((req.output as { preguntas: Array<{ texto: string; categoria: string; que_observar: string }> }).preguntas ?? []).slice(0, 10).map((q, i) => ({
    text: q.texto.slice(0, 500),
    category: q.categoria,
    guidance: q.que_observar.slice(0, 1000) || null,
    position_id: v?.position_id ?? null,
    sort_order: 60 + i,
  }));
  const { error } = await sb.from("interview_questions").insert(rows);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/vacantes/${req.vacancy_id}`);
  revalidatePath("/administracion/evaluaciones");
  return { ok: true, message: `${rows.length} pregunta(s) agregadas al banco${v?.position_id ? " para el puesto de la vacante" : ""}.` };
}

const settingsSchema = z.object({
  enabled: z.string().optional().transform((v) => v === "on"),
  provider: z.enum(["simulado", "anthropic"]),
  model: z.enum(ALLOWED_MODELS),
  monthly_budget_usd: z.coerce.number().min(0, "Presupuesto inválido.").max(100000),
  daily_requests_per_user: z.coerce.number().int().min(1, "Límite: 1 a 500.").max(500, "Límite: 1 a 500."),
  dpa_confirmed: z.string().optional().transform((v) => v === "on"),
  dpa_note: z.string().trim().max(500).optional().transform((v) => v || null),
});

/** Configuración de IA (solo administración; un proveedor externo exige acuerdo, presupuesto y aal2). */
export async function saveAiSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("usuarios:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("ai_settings").update(parsed.data).eq("id", true);
  if (error) {
    if (error.code === "42501" && /verificación en dos pasos/.test(error.message)) return { error: error.message };
    if (error.code === "23514") {
      return { error: "Para usar un proveedor externo confirme el acuerdo de tratamiento de datos y defina un presupuesto mayor a cero." };
    }
    return { error: dbErrorMessage(error) };
  }
  revalidatePath("/administracion/ia");
  return { ok: true, message: "Configuración guardada." };
}
