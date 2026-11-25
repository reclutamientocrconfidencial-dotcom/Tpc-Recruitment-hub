import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/env";

/**
 * Refresca la sesión de Supabase en cada solicitud y devuelve el usuario.
 * Compatible con el runtime de Cloudflare Workers (sin APIs exclusivas de Node).
 */
export async function updateSupabaseSession(request: NextRequest) {
  const config = getSupabaseConfig();
  let response = NextResponse.next({ request });
  if (!config) return { response, userId: null as string | null, mfaPending: false };

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() valida el token contra Supabase Auth (no confiar solo en la cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Verificación en dos pasos pendiente: el usuario tiene un factor y la sesión aún es aal1.
  let mfaPending = false;
  if (user) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    mfaPending = aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2";
  }

  return { response, userId: user?.id ?? null, mfaPending };
}
