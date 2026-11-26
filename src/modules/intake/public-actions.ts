"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { fieldErrorsFrom, formValues, type ActionState } from "@/lib/action-state";
import { cvExtension, validateCv } from "@/lib/files";
import { botCheck, extractAnswers, linkCodeSchema, publicSubmissionSchema } from "@/modules/intake/schema";
import { getPublicForm } from "@/modules/intake/repository";
import type { CvMime } from "@/types/database";

const UNAVAILABLE = "El formulario no está disponible en este momento. Intente más tarde.";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Huella de la conexión para límites de frecuencia. Nunca se guarda la IP:
 * solo un resumen con sal secreta (no reversible) que sirve para contar envíos.
 */
async function connectionHash(key: string): Promise<string | null> {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  if (!ip) return null;
  return (await sha256Hex(`${key}|${ip}`)).slice(0, 32);
}

/** Mensajes de la BD que el público puede ver (reglas redactadas en español). */
function publicError(error: { code?: string; message?: string }): string {
  if (error.code === "23514" && error.message && error.message.length < 200 && !/violates|constraint|column/i.test(error.message)) {
    return error.message;
  }
  return UNAVAILABLE;
}

/**
 * Envío de un formulario público. Capas de protección: campo trampa y tiempo
 * mínimo (anti-robots), validación Zod, tipo real del archivo por su contenido,
 * clave de servidor (la BD rechaza envíos que no vengan de esta aplicación),
 * límites de frecuencia y validación completa en la base de datos.
 */
export async function submitPublicFormAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const code = linkCodeSchema.safeParse(formData.get("code"));
  if (!code.success) return { error: UNAVAILABLE };
  const values = formValues(formData);
  delete values.website;

  const bot = botCheck(String(formData.get("website") ?? ""), String(formData.get("started_at") ?? ""));
  // A un robot se le responde como si todo hubiera salido bien (no aprende a evadir el filtro).
  if (bot === "bot") redirect(`/p/${code.data}/enviado`);
  if (bot) return { error: bot, values };

  const form = await getPublicForm(code.data);
  if (!form.available) return { error: "Este formulario ya no recibe postulaciones." };

  const parsed = publicSubmissionSchema.safeParse(Object.fromEntries(formData.entries()));
  const { answers, errors } = extractAnswers(formData, form.questions ?? []);
  const fieldErrors = { ...(parsed.success ? {} : fieldErrorsFrom(parsed.error)), ...errors };

  const file = formData.get("cv");
  let cv: { bytes: Uint8Array; mime: CvMime } | null = null;
  if (file instanceof File && file.size > 0) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateCv(bytes);
    if (check.mime === null) fieldErrors.cv = check.error;
    else cv = { bytes, mime: check.mime };
  } else if (form.require_cv) {
    fieldErrors.cv = "Adjunte su currículum (PDF o Word).";
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { error: "Revise los campos marcados.", fieldErrors, values };
  }

  if (isDemoMode()) return { error: "Modo demostración: la postulación no se envía.", values };
  const key = process.env.PUBLIC_FORM_KEY?.trim();
  if (!key || key.length < 32) {
    console.error("[intake.submit] PUBLIC_FORM_KEY no configurada");
    return { error: UNAVAILABLE, values };
  }

  const { consent, ...data } = parsed.data;
  const sb = createSupabasePublicClient();
  const { data: result, error } = await sb.rpc("submit_public_form", {
    p_key: key,
    p_code: code.data,
    p: { ...data, consent: consent === "on", answers },
    p_ip_hash: await connectionHash(key),
  });
  if (error || !result) {
    console.warn("[intake.submit]", error?.code);
    return { error: error ? publicError(error) : UNAVAILABLE, values };
  }
  const { submission_id, upload_token } = result as { submission_id: string; upload_token: string };

  let cvOk = true;
  if (cv) {
    const path = `envios/${submission_id}/${upload_token}.${cvExtension(cv.mime)}`;
    const up = await sb.storage.from("curriculums").upload(path, cv.bytes, { contentType: cv.mime, upsert: false });
    const attach = up.error
      ? up
      : await sb.rpc("attach_submission_cv", { p_key: key, p_submission_id: submission_id, p_token: upload_token, p_mime: cv.mime, p_size: cv.bytes.length });
    if (attach.error) {
      console.warn("[intake.cv]", attach.error.message);
      cvOk = false;
    }
  }
  redirect(`/p/${code.data}/enviado${cvOk ? "" : "?cv=0"}`);
}
