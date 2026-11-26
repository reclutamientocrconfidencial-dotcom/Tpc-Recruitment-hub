import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { isDemoMode } from "@/lib/env";
import { isUuid } from "@/lib/ids";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Vigencia del enlace firmado de descarga (segundos). */
export const SIGNED_URL_SECONDS = 60;

/**
 * Descarga de un currículum: la BD autoriza y REGISTRA la descarga (función
 * `rpc`), y se redirige a un enlace firmado de un minuto del almacenamiento privado.
 */
export async function signedCvRedirect(id: string, rpc: "document_for_download" | "submission_cv_for_download", param: string, fileName: string) {
  const deny = (status: number, text: string) => new NextResponse(text, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  if (!isUuid(id)) return deny(404, "No encontrado.");
  if (isDemoMode()) return deny(404, "Modo demostración: no hay archivos.");
  const user = await getSessionUser();
  if (!user) return deny(401, "Inicie sesión.");
  if (!can(user.role, "candidatos:editar")) return deny(403, "No tiene permiso para descargar currículums.");
  const sb = await createSupabaseServerClient();
  const { data: path, error } = await sb.rpc(rpc, { [param]: id });
  if (error || typeof path !== "string") return deny(403, "No tiene permiso para descargar este archivo.");
  const ext = path.endsWith(".pdf") ? "pdf" : "docx";
  const name = fileName.toLowerCase().endsWith(`.${ext}`) ? fileName : `${fileName}.${ext}`;
  const { data, error: signError } = await sb.storage.from("curriculums").createSignedUrl(path, SIGNED_URL_SECONDS, { download: name });
  if (signError || !data?.signedUrl) {
    console.warn("[documents.sign]", signError?.message);
    return deny(404, "El archivo no está disponible.");
  }
  const res = NextResponse.redirect(data.signedUrl, 303);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
