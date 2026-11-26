import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/ids";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildIcs } from "@/lib/ics";
import { siteOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Descarga una entrevista como evento de calendario (.ics), con sesión. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deny = (s: number) => new NextResponse("No disponible.", { status: s, headers: { "Cache-Control": "no-store" } });
  if (!isUuid(id) || isDemoMode()) return deny(404);
  const user = await getSessionUser();
  if (!user) return deny(401);
  if (!can(user.role, "postulaciones:editar")) return deny(403);
  const sb = await createSupabaseServerClient();
  const { data } = await sb.from("interviews").select("id, application_id, kind, scheduled_at, duration_min, location, application:applications(vacancy:vacancies(code, title))").eq("id", id).maybeSingle();
  const iv = data as unknown as { id: string; application_id: string; kind: string; scheduled_at: string; duration_min: number; location: string | null; application: { vacancy: { code: string; title: string } | null } | null } | null;
  if (!iv) return deny(404);
  const start = new Date(iv.scheduled_at);
  const ics = buildIcs("Entrevista", [
    {
      uid: `entrevista-${iv.id}`,
      start,
      end: new Date(start.getTime() + iv.duration_min * 60_000),
      summary: `Entrevista · ${iv.application?.vacancy?.code ?? ""} ${iv.application?.vacancy?.title ?? ""}`.trim(),
      location: iv.location,
      url: `${await siteOrigin()}/postulaciones/${iv.application_id}/entrevistas/${iv.id}`,
    },
  ]);
  return new NextResponse(ics, { status: 200, headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="entrevista-${iv.id.slice(0, 8)}.ics"`, "Cache-Control": "no-store" } });
}
