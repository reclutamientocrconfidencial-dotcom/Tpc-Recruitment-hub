"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, fieldErrorsFrom, type ActionState } from "@/lib/action-state";
import { resolveCatalogId } from "@/modules/catalogs/resolve";
import { candidateFormInput, candidateSchema, consentSchema } from "@/modules/candidates/schema";
import { CONSENT_CHANNELS, type DuplicateMatch } from "@/types/database";

export interface CandidateFormState extends ActionState {
  /** Posibles duplicados que requieren confirmación humana antes de guardar. */
  duplicates?: DuplicateMatch[];
}

function isManager(role: string | null) {
  return role === "admin" || role === "coordinador";
}

function dbMessage(error: { code?: string; message?: string }) {
  if (error.code === "23505") return "Ya existe un candidato con esa cédula o identificación.";
  return dbErrorMessage(error);
}

/**
 * Alta y edición de la ficha. Antes de guardar se buscan posibles duplicados:
 * cédula igual → bloqueo; correo, teléfono o nombre iguales → confirmación humana.
 */
export async function saveCandidateAction(_prev: CandidateFormState, formData: FormData): Promise<CandidateFormState> {
  const auth = await authorizeAction("candidatos:crear");
  if (auth.error !== null) return { error: auth.error };
  const idParsed = z.union([z.uuid(), z.literal("")]).safeParse(String(formData.get("id") ?? ""));
  if (!idParsed.success) return { error: "Candidato inválido." };
  const id = idParsed.data || null;
  const parsed = candidateSchema.safeParse(candidateFormInput(formData));
  const consent = id ? null : consentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || (consent && !consent.success)) {
    return {
      error: "Revise los campos marcados.",
      fieldErrors: { ...(parsed.success ? {} : fieldErrorsFrom(parsed.error)), ...(consent && !consent.success ? fieldErrorsFrom(consent.error) : {}) },
    };
  }
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const d = parsed.data;
  const sb = await createSupabaseServerClient();

  // Puesto nuevo escrito en el selector de perfiles → catálogo
  const newPosition = String(formData.get("position_new") ?? "").trim();
  const positions = [...d.position_ids];
  if (newPosition) {
    if (newPosition.length > 150) return { error: "Puesto nuevo: máximo 150 caracteres." };
    const r = await resolveCatalogId(sb, "job_positions", null, newPosition);
    if (r.error) return { error: r.error };
    if (r.id && !positions.includes(r.id)) positions.push(r.id);
  }

  const { data: dups, error: dupError } = await sb.rpc("find_candidate_duplicates", {
    p_national_id: d.national_id,
    p_email: d.email,
    p_phone: d.phone,
    p_first_name: d.first_name,
    p_last_name: d.last_name,
    p_exclude: id,
  });
  if (dupError) {
    console.warn("[candidates.duplicates]", dupError.code);
    return { error: dbErrorMessage(dupError) };
  }
  const matches = (dups ?? []) as DuplicateMatch[];
  const blocking = matches.find((m) => m.blocking);
  if (blocking) {
    return { error: `La identificación ya está registrada para ${blocking.full_name}. Abra esa ficha en lugar de crear otra.`, duplicates: matches };
  }
  if (matches.length > 0 && formData.get("confirm_not_duplicate") !== "on") {
    return { error: "Posibles duplicados: revise las coincidencias y confirme que se trata de otra persona.", duplicates: matches };
  }

  const payload = {
    ...d,
    position_ids: positions,
    primary_position_id: d.primary_position_id && positions.includes(d.primary_position_id) ? d.primary_position_id : (positions[0] ?? null),
    consent: consent?.success ? { channel: consent.data.consent_channel, evidence: consent.data.consent_evidence } : null,
  };
  const { data, error } = await sb.rpc("save_candidate", { p_id: id, p: payload });
  if (error) {
    console.warn("[candidates.save]", error.code);
    return { error: dbMessage(error) };
  }
  revalidatePath("/candidatos");
  redirect(`/candidatos/${data as string}?ok=${id ? "actualizado" : "creado"}`);
}

export interface ContactSearchState {
  results?: Array<{ candidate_id: string; full_name: string }>;
  error?: string;
}

/** Busca por cédula, correo o teléfono (la BD registra la búsqueda). */
export async function searchByContactAction(_prev: ContactSearchState, formData: FormData): Promise<ContactSearchState> {
  const auth = await authorizeAction("candidatos:editar");
  if (auth.error !== null) return { error: auth.error };
  const term = String(formData.get("contacto") ?? "").trim();
  if (term.length < 4) return { error: "Escriba al menos 4 caracteres." };
  if (term.length > 200) return { error: "Búsqueda demasiado larga." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("search_candidates_by_contact", { p_term: term });
  if (error) return { error: dbErrorMessage(error) };
  return { results: (data ?? []) as Array<{ candidate_id: string; full_name: string }> };
}

export async function revokeConsentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("candidatos:editar");
  if (auth.error !== null) return { error: auth.error };
  const id = z.uuid().safeParse(formData.get("consent_id"));
  const candidate = z.uuid().safeParse(formData.get("candidate_id"));
  const reason = z.string().trim().min(3, "Indique el motivo.").max(300).safeParse(formData.get("reason"));
  if (!id.success || !candidate.success) return { error: "Datos inválidos." };
  if (!reason.success) return { error: reason.error.issues[0]?.message ?? "Motivo inválido." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("revoke_candidate_consent", { p_consent_id: id.data, p_reason: reason.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/candidatos/${candidate.data}`);
  return { ok: true, message: "Consentimiento revocado. El candidato queda marcado como «No contactar»." };
}

export async function addConsentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("candidatos:editar");
  if (auth.error !== null) return { error: auth.error };
  const candidate = z.uuid().safeParse(formData.get("candidate_id"));
  const channel = z.enum(CONSENT_CHANNELS, { error: "Indique el canal." }).safeParse(formData.get("consent_channel"));
  const evidence = z.string().trim().max(300).safeParse(String(formData.get("consent_evidence") ?? ""));
  if (!candidate.success) return { error: "Datos inválidos." };
  if (!channel.success || !evidence.success) return { error: "Indique el canal del consentimiento." };
  if (formData.get("consent_given") !== "on") return { error: "Confirme que el candidato otorgó su consentimiento informado." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("add_candidate_consent", { p_candidate_id: candidate.data, p_channel: channel.data, p_evidence: evidence.data || null });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/candidatos/${candidate.data}`);
  return { ok: true, message: "Consentimiento registrado con la versión vigente." };
}

export async function dismissDuplicateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("candidatos:editar");
  if (auth.error !== null) return { error: auth.error };
  if (!isManager(auth.user.role)) return { error: "Solo administración y coordinación revisan duplicados." };
  const a = z.uuid().safeParse(formData.get("a"));
  const b = z.uuid().safeParse(formData.get("b"));
  if (!a.success || !b.success) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("dismiss_duplicate_pair", { p_a: a.data, p_b: b.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/candidatos/duplicados");
  return { ok: true, message: "Marcados como personas distintas." };
}

export async function mergeCandidatesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("candidatos:editar");
  if (auth.error !== null) return { error: auth.error };
  if (!isManager(auth.user.role)) return { error: "Solo administración y coordinación revisan duplicados." };
  const keep = z.uuid().safeParse(formData.get("keep"));
  const remove = z.uuid().safeParse(formData.get("remove"));
  if (!keep.success || !remove.success || keep.data === remove.data) return { error: "Seleccione qué ficha conservar." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("merge_candidates", { p_keep: keep.data, p_remove: remove.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/candidatos/duplicados");
  revalidatePath("/candidatos");
  return { ok: true, message: "Fichas fusionadas. Se conservaron las postulaciones, perfiles, consentimientos y datos de ambas." };
}
