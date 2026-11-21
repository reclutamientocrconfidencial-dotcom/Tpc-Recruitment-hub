/**
 * Configuración de entorno. Solo variables públicas (NEXT_PUBLIC_*) y banderas
 * no secretas. Nunca se lee aquí la clave service_role.
 */

export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
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
