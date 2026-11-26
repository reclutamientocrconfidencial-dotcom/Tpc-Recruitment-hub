import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AiFeature, AiOutput, SimInput } from "@/lib/ai/features";
import { pseudonymize, sha256Hex, type Identifiers } from "@/lib/ai/pseudonymize";
import { AiProviderError, anthropicProvider, simulatedProvider, type AiProvider } from "@/lib/ai/provider";
import { ALLOWED_MODELS } from "@/lib/ai/pricing";
import { dbErrorMessage } from "@/lib/db-errors";
import type { CvProfile } from "@/lib/cv/profile";
import { normalizeProfile } from "@/lib/cv/profile";

/**
 * Motor común de IA: seudonimiza, reutiliza resultados idénticos (sin
 * duplicar consultas ni costos), registra la solicitud con sus límites y
 * presupuesto en la BD, ejecuta el proveedor y guarda el resultado como
 * «pendiente de revisión». Nada se aplica solo.
 */
export type Sb = Awaited<ReturnType<typeof createSupabaseServerClient>>;
export interface Subject { candidate_id?: string; vacancy_id?: string; application_id?: string }

// ---------------------------------------------------------------------
// Armado de la entrada: solo los datos necesarios para cada función.
// ---------------------------------------------------------------------
export async function vacancyFacts(sb: Sb, vacancyId: string) {
  const [{ data: v }, { data: reqs }] = await Promise.all([
    sb.from("vacancies").select("id, title, description, province, location_detail, modality, employment_type, work_schedule, position:job_positions(name)").eq("id", vacancyId).maybeSingle(),
    sb.from("requirement_templates").select("id, requirement, requirement_type, min_level:proficiency_levels(label)").eq("vacancy_id", vacancyId),
  ]);
  if (!v) throw new AiProviderError("No se encontró la vacante o no tiene acceso a ella.");
  type V = { title: string; description: string | null; province: string | null; location_detail: string | null; modality: string | null; employment_type: string | null; work_schedule: string | null; position: { name: string } | null };
  type R = { id: string; requirement: string; requirement_type: string; min_level: { label: string } | null };
  return { v: v as unknown as V, reqs: ((reqs ?? []) as unknown as R[]) };
}

export async function candidateIdentifiers(sb: Sb, candidateId: string): Promise<{ name: string; ids: Identifiers }> {
  const { data: c } = await sb.from("candidates").select("first_name, last_name").eq("id", candidateId).maybeSingle();
  const { data: priv } = await sb.rpc("get_candidate_private", { p_candidate_id: candidateId, p_reason: "Seudonimización previa a IA" });
  const p = (Array.isArray(priv) ? priv[0] : priv) as { email: string | null; phone: string | null; phone_alt: string | null; national_id: string | null } | null;
  const name = c ? `${c.first_name} ${c.last_name}` : "";
  return { name, ids: { names: [name], emails: [p?.email], phones: [p?.phone, p?.phone_alt], ids: [p?.national_id] } };
}


export async function providerFor(sb: Sb): Promise<AiProvider> {
  const { data: s } = await sb.from("ai_settings").select("enabled, provider, model").maybeSingle();
  if (!s?.enabled) throw new AiProviderError("El asistente de IA está desactivado. Consulte a administración.");
  return s.provider === "anthropic" ? anthropicProvider((ALLOWED_MODELS as readonly string[]).includes(s.model) ? s.model : "claude-opus-5-5") : simulatedProvider;
}


/** Perfil curricular confirmado (o el borrador más reciente si no hay confirmado). */
export async function latestCvProfile(sb: Sb, candidateId: string): Promise<{ profile: CvProfile; confirmed: boolean } | null> {
  // Siempre el CONFIRMADO; solo si no existe, el borrador más reciente con datos.
  const { data } = await sb.from("candidate_cv_profiles").select("data, status, quality, created_at").eq("candidate_id", candidateId).in("status", ["confirmado", "borrador"])
    .order("created_at", { ascending: false }).limit(10);
  const rows = (data ?? []) as Array<{ data: unknown; status: string; quality: string }>;
  const pick = rows.find((r) => r.status === "confirmado") ?? rows.find((r) => r.status === "borrador" && r.quality !== "ilegible");
  if (!pick) return null;
  return { profile: normalizeProfile(pick.data), confirmed: pick.status === "confirmado" };
}

/** Seudonimiza un perfil completo (las ediciones manuales podrían contener datos personales). */
export function pseudonymizeProfile(p: CvProfile, ids: Identifiers): CvProfile {
  return normalizeProfile(JSON.parse(pseudonymize(JSON.stringify(p), ids).text));
}

export interface ExecuteOptions<F extends AiFeature> {
  feature: F;
  prompt: string;
  sim: SimInput;
  ids: Identifiers;
  subject: Subject;
  /** Reutiliza un resultado vigente con la misma entrada (solo con postulación). */
  reuse?: boolean;
  tag?: { interview_id?: string; batch_id?: string };
}

export interface ExecuteResult<F extends AiFeature> {
  requestId: string;
  output: AiOutput<F>;
  reused: boolean;
  provider: AiProvider["name"];
}

export async function executeFeature<F extends AiFeature>(sb: Sb, o: ExecuteOptions<F>): Promise<ExecuteResult<F>> {
  const provider = await providerFor(sb);
  const safe = pseudonymize(o.prompt, o.ids);
  const hash = await sha256Hex(`${o.feature}\n${provider.name}\n${safe.text}`);
  if (o.reuse && o.subject.application_id) {
    const { data: prev } = await sb.rpc("ai_find_reusable", { p_feature: o.feature, p_application_id: o.subject.application_id, p_input_hash: hash });
    if (typeof prev === "string") {
      const { data: row } = await sb.from("ai_requests").select("output").eq("id", prev).maybeSingle();
      if (row?.output) return { requestId: prev, output: row.output as AiOutput<F>, reused: true, provider: provider.name };
    }
  }
  const begin = await sb.rpc("ai_begin_request", {
    p_feature: o.feature,
    p_candidate_id: o.subject.candidate_id ?? null,
    p_vacancy_id: o.subject.vacancy_id ?? null,
    p_application_id: o.subject.application_id ?? null,
    p_input_hash: hash,
    p_pseudonymized: true,
  });
  if (begin.error) throw new AiProviderError(dbErrorMessage(begin.error));
  const requestId = (begin.data as { id: string }).id;
  try {
    if (o.tag?.interview_id || o.tag?.batch_id) {
      const t = await sb.rpc("ai_tag_request", { p_id: requestId, p_interview_id: o.tag.interview_id ?? null, p_batch_id: o.tag.batch_id ?? null });
      if (t.error) throw new AiProviderError(dbErrorMessage(t.error));
    }
    // El simulador recibe lo mismo que un proveedor externo: datos seudonimizados.
    const sim: SimInput = {
      ...o.sim,
      text: o.sim.text ? pseudonymize(o.sim.text, o.ids).text : undefined,
      facts: o.sim.facts?.map((f) => pseudonymize(f, o.ids).text),
      profile: o.sim.profile ? pseudonymizeProfile(o.sim.profile, o.ids) : o.sim.profile,
      answers: o.sim.answers?.map((a) => ({ ...a, notes: a.notes ? pseudonymize(a.notes, o.ids).text : a.notes })),
    };
    const result = await provider.run(o.feature, safe.text, sim);
    const fin = await sb.rpc("ai_finish_request", {
      p_id: requestId,
      p_output: result.output,
      p_input_tokens: result.inputTokens,
      p_output_tokens: result.outputTokens,
      p_cost_usd: result.costUsd,
    });
    if (fin.error) throw new AiProviderError(dbErrorMessage(fin.error));
    return { requestId, output: result.output, reused: false, provider: provider.name };
  } catch (err) {
    const message = err instanceof AiProviderError ? err.message : "No fue posible completar la consulta de IA.";
    if (!(err instanceof AiProviderError)) console.error("[ai.execute]", err);
    await sb.rpc("ai_finish_request", { p_id: requestId, p_output: null, p_input_tokens: 0, p_output_tokens: 0, p_cost_usd: 0, p_error: message });
    throw new AiProviderError(message);
  }
}

/** Texto del perfil para el prompt (sin datos de contacto). */
export function profilePrompt(p: CvProfile): string {
  const lines: string[] = [];
  if (p.resumen) lines.push(`Resumen: ${p.resumen}`);
  lines.push(`Puesto actual: ${p.puesto_actual || "sin indicar"} · Experiencia total: ${p.anios_experiencia || "sin indicar"} años`);
  if (p.experiencia_especifica) lines.push(`Experiencia específica: ${p.experiencia_especifica}`);
  if (p.experiencia.length) {
    lines.push("Trayectoria:");
    for (const e of p.experiencia) {
      lines.push(`- ${e.cargo}${e.empresa ? `, ${e.empresa}` : ""} (${e.desde || "?"} – ${e.hasta || "?"})`);
      for (const f of e.funciones) lines.push(`  · Función: ${f}`);
      for (const l of e.logros) lines.push(`  · Logro: ${l}`);
    }
  }
  if (p.formacion.length) lines.push(`Formación: ${p.formacion.map((f) => [f.titulo, f.institucion, f.periodo].filter(Boolean).join(", ")).join("; ")}`);
  if (p.habilidades.length) lines.push(`Habilidades: ${p.habilidades.join(", ")}`);
  if (p.idiomas.length) lines.push(`Idiomas: ${p.idiomas.map((i) => `${i.idioma} ${i.nivel}`).join(", ")}`);
  if (p.certificaciones.length) lines.push(`Certificaciones: ${p.certificaciones.join("; ")}`);
  if (p.licencias.length) lines.push(`Licencias: ${p.licencias.join("; ")}`);
  if (p.conocimientos.length) lines.push(`Conocimientos: ${p.conocimientos.join(", ")}`);
  return lines.join("\n");
}
