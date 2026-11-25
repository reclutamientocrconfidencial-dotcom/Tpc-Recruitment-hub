import "server-only";
import { headers } from "next/headers";

/**
 * Origen público del sitio para armar enlaces y códigos QR. Usa
 * NEXT_PUBLIC_SITE_URL si está definida; si no, el dominio de la solicitud.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured && /^https?:\/\/[^/]+/.test(configured)) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
