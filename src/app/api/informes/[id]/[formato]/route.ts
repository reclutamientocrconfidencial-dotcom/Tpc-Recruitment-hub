import { exportReport } from "@/modules/evaluations/export";

export const dynamic = "force-dynamic";

/** Exportación registrada del informe ejecutivo final (Word o PDF). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; formato: string }> }) {
  const { id, formato } = await params;
  return exportReport(id, formato);
}
