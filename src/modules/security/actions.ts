"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_READ_ONLY, type ActionState } from "@/lib/action-state";

/** Activa o desactiva la exigencia de verificación en dos pasos (solo admin con aal2; la BD lo exige). */
export async function setMfaRequiredAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("usuarios:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const required = formData.get("mfa_required") === "true";
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    return { error: "Primero active su propia verificación en dos pasos e inicie sesión con su código." };
  }
  const { data, error } = await sb.from("security_settings").update({ mfa_required: required }).eq("singleton", true).select("mfa_required");
  if (error) {
    console.warn("[security.mfaRequired]", error.code);
    return { error: "No fue posible guardar el cambio." };
  }
  if (!data || data.length === 0) return { error: "No tiene permiso para cambiar esta configuración." };
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: required
      ? "Verificación en dos pasos obligatoria: quien no la tenga configurada solo podrá configurarla."
      : "La verificación en dos pasos dejó de ser obligatoria.",
  };
}

const REAL_DATA_PHRASE = "HABILITAR DATOS REALES";

/**
 * Habilita (o vuelve a bloquear) la carga de datos personales reales. Solo admin con aal2; la base de datos exige
 * además la verificación en dos pasos obligatoria, y el consentimiento debe tener aprobación jurídica.
 */
export async function setRealDataAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("usuarios:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const enable = formData.get("real_data") === "true";
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  if (enable && String(formData.get("confirmacion") ?? "").trim().toUpperCase() !== REAL_DATA_PHRASE) {
    return { error: `Escriba «${REAL_DATA_PHRASE}» para confirmar.` };
  }
  const sb = await createSupabaseServerClient();
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") return { error: "Primero active su propia verificación en dos pasos e inicie sesión con su código." };
  if (enable) {
    const { data: c } = await sb.from("consent_texts").select("legal_approved").eq("is_active", true).maybeSingle();
    if (!c?.legal_approved) return { error: "El texto de consentimiento vigente no tiene aprobación jurídica (Administración → Consentimientos)." };
  }
  const { data, error } = await sb.from("security_settings").update({ real_data_enabled: enable }).eq("singleton", true).select("real_data_enabled");
  if (error) {
    if (error.code === "23514") return { error: "Para habilitar datos reales, primero exija la verificación en dos pasos a todos los usuarios." };
    console.warn("[security.realData]", error.code);
    return { error: "No fue posible guardar el cambio." };
  }
  if (!data || data.length === 0) return { error: "No tiene permiso para cambiar esta configuración." };
  revalidatePath("/administracion/seguridad");
  return { ok: true, message: enable ? "Datos reales habilitados. Quedó registrado en la bitácora." : "Se volvió a limitar el sistema a datos ficticios." };
}
