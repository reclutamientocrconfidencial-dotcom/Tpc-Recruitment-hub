import { crossSiteDenied } from "@/lib/http/same-site";
import { exportReport } from "@/modules/evaluations/export";

export const dynamic = "force-dynamic";

/** Exportación registrada del informe ejecutivo final (Word o PDF). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; formato: string }> }) {
  const denied = crossSiteDenied(req);
  if (denied) return denied;
  const { id, formato } = await params;
  return exportReport(id, formato);
}
