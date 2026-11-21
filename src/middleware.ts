import { NextResponse, type NextRequest } from "next/server";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/auth/demo";

const PUBLIC_PATHS = ["/login", "/auth"];

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

  if (isDemoMode()) {
    response = NextResponse.next({ request });
    authenticated = request.cookies.get(DEMO_SESSION_COOKIE)?.value === DEMO_SESSION_VALUE;
  } else if (isSupabaseConfigured()) {
    const result = await updateSupabaseSession(request);
    response = result.response;
    authenticated = result.userId !== null;
  } else {
    // Sin configuración: solo se permite la pantalla de inicio de sesión (muestra el aviso).
    if (isPublic(pathname)) return NextResponse.next({ request });
    return redirectTo(request, "/login");
  }

  if (!authenticated && !isPublic(pathname)) return redirectTo(request, "/login", true, response);
  if (authenticated && pathname === "/login") return redirectTo(request, "/dashboard", false, response);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
