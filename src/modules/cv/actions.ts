"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, type ActionState } from "@/lib/action-state";
import { assessQuality, extractCvText, type ExtractedText } from "@/lib/cv/extract-text";
import { EMPTY_PROFILE, cvProfileSchema, normalizeProfile, type CvProfile } from "@/lib/cv/profile";
import { parseCvText } from "@/lib/cv/parse";
import { pseudonymize } from "@/lib/ai/pseudonymize";
import { AiProviderError } from "@/lib/ai/provider";
import { candidateIdentifiers, executeFeature, type Sb } from "@/modules/ai/engine";

const MAX_TEXT = 30_000;

async function guard() {
  const auth = await authorizeAction("candidatos:editar");
  if (auth.error !== null) return { error: auth.error } as const;
  if (isDemoMode()) return { error: DEMO_READ_ONLY } as const;
  return { sb: await createSupabaseServerClient() } as const;
}

const readSchema = z.object({
  candidate_id: z.uuid(),
  document_id: z.uuid().optional(),
  // Texto pegado o extraído de un PDF en el navegador (se recorta a 30.000 caracteres)
  text: z.string().max(120_000, "El texto del CV es demasiado extenso.").optional(),
  pages: z.coerce.number().int().min(0).max(300).optional(),
  pdf_error: z.string().optional(),
});

/** Obtiene el texto de un CV almacenado: la BD autoriza y REGISTRA el acceso; el archivo nunca sale al navegador. */
async function documentText(sb: Sb, candidateId: string, documentId: string, fromBrowser: { text?: string; pages?: number; pdfError?: boolean }): Promise<ExtractedText> {
  const { data: doc } = await sb.from("candidate_documents").select("id, candidate_id, mime").eq("id", documentId).maybeSingle();
  if (!doc || doc.candidate_id !== candidateId) throw new AiProviderError("El documento no pertenece al candidato.");
  if (doc.mime === "application/pdf") {
    // El PDF se leyó en el navegador (la descarga quedó registrada en la bitácora de accesos).
    if (fromBrowser.pdfError || !fromBrowser.text?.trim()) {
      return {
        text: "",
        pages: fromBrowser.pages ?? 0,
        quality: "ilegible",
        note: fromBrowser.pdfError
          ? "El PDF está dañado, protegido con contraseña o no se pudo abrir. Complete el perfil manualmente."
          : "El documento parece escaneado o no contiene texto seleccionable. Ingrese o corrija los datos manualmente.",
      };
    }
    const text = fromBrowser.text.trim();
    return { text, pages: fromBrowser.pages || 1, ...assessQuality(text, fromBrowser.pages || 1) };
  }
  const { data: path, error } = await sb.rpc("document_for_download", { p_document_id: documentId });
  if (error || typeof path !== "string") throw new AiProviderError("No tiene permiso para leer este documento.");
  const file = await sb.storage.from("curriculums").download(path);
  if (file.error || !file.data) throw new AiProviderError("El archivo no está disponible en el almacenamiento.");
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  try {
    return await extractCvText(bytes, doc.mime);
  } catch (err) {
    console.warn("[cv.extract]", err instanceof Error ? err.name : "error");
    return { text: "", pages: 0, quality: "ilegible", note: "El archivo está dañado, protegido con contraseña o en un formato no compatible. Complete el perfil manualmente." };
  }
}

/**
 * Lee un CV (archivo PDF/Word guardado o texto pegado) y crea un perfil en
 * BORRADOR para revisión humana. Documentos escaneados o ilegibles no se envían
 * a la IA: se marcan y el perfil queda vacío para completarlo a mano.
 */
export async function readCvAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const parsed = readSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { candidate_id, document_id, text: pasted, pages, pdf_error } = parsed.data;
  if (!document_id && !pasted?.trim()) return { error: "Seleccione un currículum guardado o pegue su texto." };
  const sb = g.sb;
  let profileId: string;
  try {
    const read = document_id
      ? await documentText(sb, candidate_id, document_id, { text: pasted, pages, pdfError: pdf_error === "1" })
      : { text: pasted!.trim(), pages: 1, ...assessQuality(pasted!.trim(), 1) };
    const text = read.text.slice(0, MAX_TEXT);
    let data: CvProfile = EMPTY_PROFILE;
    let source: "ia" | "simulado" | "manual" = "manual";
    let requestId: string | null = null;
    if (read.quality !== "ilegible") {
      const { data: settings } = await sb.from("ai_settings").select("enabled").maybeSingle();
      const { ids } = await candidateIdentifiers(sb, candidate_id);
      if (settings?.enabled) {
        const r = await executeFeature(sb, { feature: "extraer_cv", prompt: `Texto del currículum (seudonimizado):\n\n${text}`, sim: { text }, ids, subject: { candidate_id } });
        data = normalizeProfile(r.output);
        source = r.provider === "anthropic" ? "ia" : "simulado";
        requestId = r.requestId;
      } else {
        // Sin IA: lectura local por reglas (no sale del servidor), sobre texto seudonimizado.
        data = normalizeProfile(parseCvText(pseudonymize(text, ids).text));
        source = "simulado";
      }
    }
    const ins = await sb
      .from("candidate_cv_profiles")
      .insert({ candidate_id, document_id: document_id ?? null, source, ai_request_id: requestId, quality: read.quality, quality_note: read.note?.slice(0, 300) ?? null, data })
      .select("id")
      .single();
    if (ins.error) return { error: dbErrorMessage(ins.error) };
    profileId = ins.data.id;
  } catch (err) {
    if (!(err instanceof AiProviderError)) console.error("[cv.read]", err);
    return { error: err instanceof AiProviderError ? err.message : "No fue posible leer el currículum." };
  }
  revalidatePath(`/candidatos/${candidate_id}`);
  redirect(`/candidatos/${candidate_id}/perfil-cv/${profileId}`);
}

const saveSchema = z.object({ id: z.uuid(), candidate_id: z.uuid(), data: z.string().max(200_000), intent: z.enum(["guardar", "confirmar"]), update_candidate: z.string().optional() });

/** Guarda las correcciones del reclutador y, si lo pide, confirma el perfil (incorporándolo a la ficha). */
export async function saveCvProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const parsed = saveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Datos inválidos." };
  let raw: unknown;
  try {
    raw = JSON.parse(parsed.data.data);
  } catch {
    return { error: "Datos inválidos." };
  }
  const data = cvProfileSchema.safeParse(normalizeProfile(raw));
  if (!data.success) return { error: "Revise los datos del perfil." };
  const { data: row } = await g.sb.from("candidate_cv_profiles").select("id, status, ai_request_id").eq("id", parsed.data.id).eq("candidate_id", parsed.data.candidate_id).maybeSingle();
  if (!row) return { error: "No se encontró el perfil o no tiene acceso a él." };
  if (row.status !== "borrador") return { error: "Este perfil ya no está en borrador: cree una nueva lectura para cambiarlo." };
  const up = await g.sb.from("candidate_cv_profiles").update({ data: data.data }).eq("id", row.id);
  if (up.error) return { error: dbErrorMessage(up.error) };
  if (parsed.data.intent === "confirmar") {
    const c = await g.sb.rpc("confirm_cv_profile", { p_id: row.id, p_update_candidate: parsed.data.update_candidate === "on" });
    if (c.error) return { error: dbErrorMessage(c.error) };
    if (row.ai_request_id) await g.sb.rpc("ai_review_request", { p_id: row.ai_request_id, p_decision: "aceptado" }).then(({ error }) => error && console.warn("[cv.review]", error.code));
  }
  revalidatePath(`/candidatos/${parsed.data.candidate_id}`);
  revalidatePath(`/candidatos/${parsed.data.candidate_id}/perfil-cv/${row.id}`);
  return { ok: true, message: parsed.data.intent === "confirmar" ? "Perfil confirmado e incorporado a la ficha." : "Cambios guardados (sigue en borrador)." };
}

/** Descarta un borrador (y su resultado de IA). */
export async function discardCvProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const p = z.object({ id: z.uuid(), candidate_id: z.uuid() }).safeParse(Object.fromEntries(formData.entries()));
  if (!p.success) return { error: "Datos inválidos." };
  const { data: row } = await g.sb.from("candidate_cv_profiles").select("id, status, ai_request_id").eq("id", p.data.id).eq("candidate_id", p.data.candidate_id).maybeSingle();
  if (!row || row.status !== "borrador") return { error: "Solo se descarta un perfil en borrador." };
  const up = await g.sb.from("candidate_cv_profiles").update({ status: "descartado" }).eq("id", row.id);
  if (up.error) return { error: dbErrorMessage(up.error) };
  if (row.ai_request_id) await g.sb.rpc("ai_review_request", { p_id: row.ai_request_id, p_decision: "descartado" }).then(({ error }) => error && console.warn("[cv.review]", error.code));
  revalidatePath(`/candidatos/${p.data.candidate_id}`);
  redirect(`/candidatos/${p.data.candidate_id}`);
}
