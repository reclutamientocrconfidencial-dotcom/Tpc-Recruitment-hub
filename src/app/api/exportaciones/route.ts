import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { isDemoMode } from "@/lib/env";
import { dbErrorMessage } from "@/lib/db-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toCsv, toXlsx, type Cell } from "@/lib/export/tabular";
import { COLUMN_LABELS, DATASETS, type Dataset } from "@/modules/analytics/datasets";

export const dynamic = "force-dynamic";

const schema = z.object({
  dataset: z.enum(Object.keys(DATASETS) as [Dataset, ...Dataset[]]),
  format: z.enum(["xlsx", "csv"]),
  reason: z.string().trim().min(10, "Indique el motivo de la exportación (mínimo 10 caracteres).").max(300),
  desde: z.iso.date(),
  hasta: z.iso.date(),
  cliente: z.union([z.literal(""), z.uuid()]).optional(),
});

function back(req: Request, message: string) {
  const url = new URL("/indicadores", req.url);
  url.searchParams.set("exportacion", message.slice(0, 200));
  return NextResponse.redirect(url, 303);
}

/**
 * Exportación controlada: solo rol autorizado, mismo origen (anti-CSRF), motivo
 * obligatorio; la BD valida el límite y la cuota y REGISTRA la exportación antes
 * de entregar los datos.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return new NextResponse("Solicitud no permitida.", { status: 403 });
  if (isDemoMode()) return back(req, "Modo demostración: no hay datos para exportar.");
  const user = await getSessionUser();
  if (!user) return new NextResponse("Inicie sesión.", { status: 401 });
  if (!can(user.role, "exportaciones:crear")) return back(req, "No tiene permiso para exportar.");
  const parsed = schema.safeParse(Object.fromEntries((await req.formData()).entries()));
  if (!parsed.success) return back(req, parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const f = parsed.data;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("export_dataset", { p_dataset: f.dataset, p_reason: f.reason, p_from: f.desde, p_to: f.hasta, p_client: f.cliente || null });
  if (error) return back(req, dbErrorMessage(error));
  const { columns, rows } = data as { columns: string[]; rows: Array<Record<string, Cell>> };
  const headers = columns.map((c) => COLUMN_LABELS[c] ?? c);
  const matrix = rows.map((r) => columns.map((c) => r[c] ?? null));
  const base = `${f.dataset}_${f.desde}_${f.hasta}`;
  const body = f.format === "csv" ? toCsv(headers, matrix) : toXlsx(DATASETS[f.dataset].label, headers, matrix);
  return new NextResponse(typeof body === "string" ? body : new Blob([body as BlobPart]), {
    status: 200,
    headers: {
      "Content-Type": f.format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.${f.format}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
