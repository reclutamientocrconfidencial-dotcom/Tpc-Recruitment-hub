import { exportTerna } from "@/modules/evaluations/export";

export const dynamic = "force-dynamic";

/** Exportación registrada del informe comparativo de terna (Word o PDF). */
export async function GET(req: Request, { params }: { params: Promise<{ vacancyId: string; formato: string }> }) {
  const { vacancyId, formato } = await params;
  const ids = new URL(req.url).searchParams.getAll("ids").slice(0, 10);
  return exportTerna(vacancyId, formato, ids);
}
