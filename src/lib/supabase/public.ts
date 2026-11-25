import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/env";

/**
 * Cliente ANÓNIMO de Supabase para los formularios públicos (sin cookies ni
 * sesión). Solo puede ejecutar las funciones acotadas concedidas a `anon`
 * (get_public_form, submit_public_form, attach_submission_cv) y cargar un
 * currículum con el token de un solo uso de su envío. Nunca usa claves secretas.
 */
export function createSupabasePublicClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase no está configurado.");
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
