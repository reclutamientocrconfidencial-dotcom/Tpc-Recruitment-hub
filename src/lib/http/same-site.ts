import { NextResponse } from "next/server";

/**
 * Rechaza descargas y exportaciones iniciadas desde OTRO sitio (enlace o
 * formulario externo): evitan registros de acceso y descargas no deseadas
 * con la sesión del usuario. Los navegadores modernos envían Sec-Fetch-Site;
 * si no viene (clientes antiguos), se permite y decide la autorización normal.
 */
export function crossSiteDenied(req: Request): NextResponse | null {
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return new NextResponse("Solicitud no permitida.", { status: 403, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  }
  return null;
}
