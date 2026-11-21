/**
 * Configuración de entorno. Solo variables públicas (NEXT_PUBLIC_*) y banderas
 * no secretas. Nunca se lee aquí la clave service_role.
 */

export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  // Proyectos nuevos: clave "publishable" (sb_publishable_...). Proyectos antiguos: clave "anon" (JWT).
  // Ambas son públicas y seguras en el navegador SOLO porque todas las tablas tienen RLS.
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  // Defensa: nunca aceptar una clave secreta en una variable pública.
  if (anonKey.startsWith("sb_secret_") || isServiceRoleJwt(anonKey)) {
    throw new Error("Configuración insegura: se colocó una clave SECRETA de Supabase en una variable pública.");
  }
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

/**
 * Modo demostración: interfaz con datos ficticios, sin base de datos.
 * Requiere TPC_DEMO_MODE=true Y que Supabase NO esté configurado, de modo que
 * nunca pueda convivir con datos reales.
 */
export function isDemoMode(): boolean {
  return process.env.TPC_DEMO_MODE === "true" && !isSupabaseConfigured();
}

export const APP_NAME = "TPC Recruitment Hub";
export const COMPANY_NAME = "The People Outsourcing Company S.A.";

/** Detecta una clave service_role (JWT) para impedir su uso accidental en el frontend. */
function isServiceRoleJwt(key: string): boolean {
  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string };
    return json.role === "service_role";
  } catch {
    return false;
  }
}
