import { NextResponse, type NextRequest } from "next/server";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/auth/demo";

// "/p": formularios públicos de postulación (sin sesión; protegidos por funciones acotadas en la BD).
// "/api/calendario": suscripción de calendario con enlace secreto (las aplicaciones de calendario no inician sesión).
const PUBLIC_PATHS = ["/login", "/auth", "/api/salud", "/p", "/api/calendario"];
const MFA_PATH = "/login/verificacion";

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function redirectTo(request: NextRequest, pathname: string, withNext = false, from?: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (withNext && request.nextUrl.pathname !== "/") {
    url.searchParams.set("next", request.nextUrl.pathname);
  }
  const redirect = NextResponse.redirect(url);
  // Conserva las cookies de sesión refrescadas por Supabase.
  from?.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response: NextResponse;
  let authenticated: boolean;
  let mfaPending = false;

  if (isDemoMode()) {
    response = NextResponse.next({ request });
    authenticated = request.cookies.get(DEMO_SESSION_COOKIE)?.value === DEMO_SESSION_VALUE;
  } else if (isSupabaseConfigured()) {
    const result = await updateSupabaseSession(request);
    response = result.response;
    authenticated = result.userId !== null;
    mfaPending = result.mfaPending;
  } else {
    // Sin configuración: solo se permite la pantalla de inicio de sesión (muestra el aviso).
    if (isPublic(pathname)) return NextResponse.next({ request });
    return redirectTo(request, "/login");
  }

  if (!authenticated && !isPublic(pathname)) return redirectTo(request, "/login", true, response);
  // Verificación en dos pasos: con un factor configurado, nada es accesible hasta ingresar el código.
  if (authenticated && mfaPending && pathname !== MFA_PATH && !pathname.startsWith("/api/salud")) {
    return redirectTo(request, MFA_PATH, true, response);
  }
  if (authenticated && !mfaPending && pathname === MFA_PATH) return redirectTo(request, "/dashboard", false, response);
  if (authenticated && pathname === "/login") return redirectTo(request, "/dashboard", false, response);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
