import { NextResponse } from "next/server";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { buildIcs } from "@/lib/ics";
import { isDemoMode } from "@/lib/env";
import { siteOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Suscripción de calendario (iCalendar). Sin sesión: la autoriza el enlace
 * secreto del usuario (revocable). Solo entrevistas y tareas propias, sin
 * nombres de candidatos ni datos de contacto.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const raw = (await params).token.replace(/\.ics$/, "");
  const notFound = () => new NextResponse("No encontrado.", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (isDemoMode() || !/^[0-9a-f]{64}$/.test(raw)) return notFound();
  const sb = createSupabasePublicClient();
  const { data, error } = await sb.rpc("calendar_feed", { p_token: raw });
  if (error) return notFound();
  type Row = { uid: string; starts_at: string; ends_at: string; summary: string; location: string | null; kind: string; ref_id: string };
  const rows = (data ?? []) as Row[];
  const origin = await siteOrigin();
  const ics = buildIcs(
    "TPC · Mi jornada",
    rows.map((r) => ({
      uid: r.uid,
      start: new Date(r.starts_at),
      end: new Date(r.ends_at),
      summary: r.summary,
      location: r.location,
      url: r.kind === "entrevista" ? `${origin}/postulaciones/${r.ref_id}` : `${origin}/mi-jornada`,
    })),
  );
  return new NextResponse(ics, { status: 200, headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
