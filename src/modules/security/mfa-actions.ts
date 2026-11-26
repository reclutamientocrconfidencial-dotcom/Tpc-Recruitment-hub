"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/validation";
import { factorNameSchema, totpCodeSchema } from "@/modules/security/schema";
import { verifiedTotpFactors } from "@/modules/security/factors";

export interface MfaState {
  error?: string;
  ok?: boolean;
  message?: string;
  /** Inscripción en curso: código QR (SVG) y clave para ingresar manualmente. */
  enrollment?: { factorId: string; qr: string; secret: string };
}

const DEMO = "Modo demostración: la verificación en dos pasos requiere Supabase.";

/** Paso 2 del inicio de sesión: verifica el código del factor TOTP ya configurado. */
export async function verifyLoginCodeAction(_prev: MfaState, formData: FormData): Promise<MfaState> {
  if (isDemoMode()) return { error: DEMO };
  const code = totpCodeSchema.safeParse(formData.get("code"));
  if (!code.success) return { error: code.error.issues[0]?.message ?? "Código inválido." };
  const sb = await createSupabaseServerClient();
  const factorId = (await verifiedTotpFactors(sb))[0]?.id;
  if (!factorId) return { error: "No se encontró una aplicación autenticadora configurada." };
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.data });
  if (error) {
    console.warn("[mfa] verificación fallida:", error.code ?? error.status ?? "");
    return { error: "Código incorrecto o vencido. Espere el siguiente código e intente de nuevo." };
  }
  redirect(safeRedirectPath(formData.get("next")));
}

/** Inicia la configuración de una aplicación autenticadora (elimina intentos previos sin terminar). */
export async function startEnrollAction(_prev: MfaState, formData: FormData): Promise<MfaState> {
  if (isDemoMode()) return { error: DEMO };
  const name = factorNameSchema.safeParse(formData.get("friendly_name") ?? "");
  if (!name.success) return { error: name.error.issues[0]?.message ?? "Nombre inválido." };
  const sb = await createSupabaseServerClient();
  const { data: list } = await sb.auth.mfa.listFactors();
  for (const f of list?.all ?? []) {
    if (f.status === "unverified") await sb.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `${name.data} ${Date.now().toString(36)}` });
  if (error || !data) {
    console.warn("[mfa] inscripción fallida:", error?.code ?? error?.status ?? "");
    return { error: "No fue posible iniciar la configuración. Intente de nuevo." };
  }
  return { enrollment: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret } };
}

/** Confirma la configuración con el primer código; la sesión pasa a aal2. */
export async function confirmEnrollAction(prev: MfaState, formData: FormData): Promise<MfaState> {
  if (isDemoMode()) return { error: DEMO };
  const factorId = z.uuid().safeParse(formData.get("factor_id"));
  const code = totpCodeSchema.safeParse(formData.get("code"));
  if (!factorId.success) return { error: "Configuración inválida. Inicie de nuevo." };
  if (!code.success) return { ...prev, error: code.error.issues[0]?.message ?? "Código inválido." };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factorId.data, code: code.data });
  if (error) {
    console.warn("[mfa] confirmación fallida:", error.code ?? error.status ?? "");
    return { ...prev, error: "Código incorrecto o vencido. Revise la hora del teléfono y use el código actual." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Verificación en dos pasos activada. A partir de ahora se le pedirá un código al iniciar sesión." };
}

/** Elimina una aplicación autenticadora (Supabase exige haber verificado en esta sesión). */
export async function removeFactorAction(_prev: MfaState, formData: FormData): Promise<MfaState> {
  if (isDemoMode()) return { error: DEMO };
  const factorId = z.uuid().safeParse(formData.get("factor_id"));
  if (!factorId.success) return { error: "Datos inválidos." };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.mfa.unenroll({ factorId: factorId.data });
  if (error) {
    console.warn("[mfa] eliminación fallida:", error.code ?? error.status ?? "");
    return { error: "No fue posible eliminarla. Cierre sesión, vuelva a ingresar con su código e intente de nuevo." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Aplicación autenticadora eliminada." };
}
