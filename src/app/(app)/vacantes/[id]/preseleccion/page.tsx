import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/ids";
import { formatDate } from "@/lib/format";
import { getVacancy } from "@/modules/vacancies/repository";
import { getAiSettings } from "@/modules/ai/repository";
import { listVacancyScreenings } from "@/modules/screening/repository";
import { BatchRunner } from "@/modules/screening/batch-runner";
import { cancelBatchAction, startBatchAction, stepBatchAction } from "@/modules/screening/actions";
import { MATCH_SYMBOL } from "@/modules/screening/matrix";
import { MATCH_LABEL, MATCH_STATUS, type MatchStatus } from "@/lib/ai/features";

export const metadata: Metadata = { title: "Preselección" };

export default async function PreseleccionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requireSessionUser();
  if (!can(user.role, "postulaciones:editar")) notFound();
  const [v, settings, data] = await Promise.all([getVacancy(id), getAiSettings(), listVacancyScreenings(id)]);
  if (!v) notFound();
  const reqNames = [...new Set(data.rows.flatMap((r) => r.analysis?.data.matriz.map((m) => m.requisito) ?? []))].slice(0, 12);
  const count = (r: (typeof data.rows)[number], s: MatchStatus, mandatoryOnly = false) =>
    r.analysis?.data.matriz.filter((m) => m.estado === s && (!mandatoryOnly || m.tipo === "obligatorio")).length ?? 0;
  // Orden informativo (más requisitos obligatorios confirmados primero); no es una decisión.
  const rows = [...data.rows].sort((a, b) => count(b, "confirmado", true) - count(a, "confirmado", true) || a.candidate.localeCompare(b.candidate, "es"));
  const batch = data.batch as { status: string; total: number; processed: number; reused: number; failed: number; cost_usd: number; stop_reason: string | null; created_at: string } | null;

  return (
    <>
      <PageHeader
        title="Preselección asistida"
        description={`${v.title} · ${v.code}`}
        actions={<Link href={`/vacantes/${id}`} className="text-sm font-semibold text-brand-700 underline">Volver a la vacante</Link>}
      />
      <Alert className="mb-4">
        La matriz documenta evidencia del currículum frente a cada requisito. <strong>No descarta ni aprueba candidatos:</strong> la decisión de avanzar
        o descartar es siempre del reclutador, que debe revisar y aceptar cada análisis en la postulación.
      </Alert>
      <Card>
        <CardHeader
          title="Análisis por lotes"
          description={
            settings?.enabled
              ? `Analiza las postulaciones activas que tengan perfil curricular. Reutiliza los análisis cuya información no cambió (sin costo).${settings.provider !== "simulado" ? " Se detiene al llegar al tope de costo." : " Proveedor simulado: sin costo y sin enviar datos a terceros."}`
              : "El asistente de IA está desactivado."
          }
        />
        <div className="px-5 py-4">
          {settings?.enabled ? <BatchRunner vacancyId={id} start={startBatchAction} step={stepBatchAction} cancel={cancelBatchAction} external={settings.provider !== "simulado"} /> : null}
          {batch ? (
            <p className="mt-3 text-xs text-neutral-500">
              Último lote: {formatDate(batch.created_at)} · {batch.status} · {batch.processed} analizadas, {batch.reused} reutilizadas, {batch.failed} con error de {batch.total} · US$ {Number(batch.cost_usd).toFixed(4)}
              {batch.stop_reason ? ` · ${batch.stop_reason}` : ""}
            </p>
          ) : null}
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Comparación de candidatos" description="Último análisis vigente de cada postulación activa. Orden informativo por requisitos obligatorios confirmados." />
        {data.error ? <p className="px-5 py-4 text-sm text-brand-700">{data.error}</p> : null}
        <p className="flex flex-wrap gap-3 px-5 pt-4 text-xs text-neutral-600" aria-label="Leyenda">
          {MATCH_STATUS.map((s) => (
            <span key={s}><span aria-hidden className="font-bold">{MATCH_SYMBOL[s]}</span> {MATCH_LABEL[s]}</span>
          ))}
        </p>
        <div className="overflow-x-auto px-5 py-4">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <caption className="sr-only">Comparación de candidatos por requisito</caption>
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                <th scope="col" className="py-2 pr-3">Candidato</th>
                <th scope="col" className="py-2 pr-3 text-center">Confirmados</th>
                <th scope="col" className="py-2 pr-3 text-center">Parciales</th>
                <th scope="col" className="py-2 pr-3 text-center">Incumplidos</th>
                <th scope="col" className="py-2 pr-3 text-center">Sin información</th>
                {reqNames.map((n) => (
                  <th key={n} scope="col" className="max-w-[9rem] py-2 pr-3 text-center font-medium normal-case" title={n}>
                    <span className="line-clamp-2">{n}</span>
                  </th>
                ))}
                <th scope="col" className="py-2">Análisis</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const by = new Map(r.analysis?.data.matriz.map((m) => [m.requisito, m.estado]) ?? []);
                return (
                  <tr key={r.application_id} className="border-b border-neutral-100">
                    <th scope="row" className="py-2 pr-3 font-medium">
                      <Link href={`/postulaciones/${r.application_id}`} className="hover:text-brand-600 hover:underline">{r.candidate}</Link>
                      {r.stage ? <span className="block text-xs font-normal text-neutral-500">{r.stage}</span> : null}
                    </th>
                    {r.analysis ? (
                      <>
                        <td className="py-2 pr-3 text-center tabular-nums">{count(r, "confirmado")}</td>
                        <td className="py-2 pr-3 text-center tabular-nums">{count(r, "parcial")}</td>
                        <td className="py-2 pr-3 text-center tabular-nums">{count(r, "incumplido")}</td>
                        <td className="py-2 pr-3 text-center tabular-nums">{count(r, "insuficiente")}</td>
                        {reqNames.map((n) => {
                          const s = by.get(n);
                          return (
                            <td key={n} className="py-2 pr-3 text-center">
                              {s ? <span title={MATCH_LABEL[s]} className={s === "confirmado" ? "text-emerald-700" : s === "incumplido" ? "text-brand-700" : s === "parcial" ? "text-amber-700" : "text-neutral-500"}><span aria-hidden>{MATCH_SYMBOL[s]}</span><span className="sr-only">{MATCH_LABEL[s]}</span></span> : <span className="text-neutral-300">—</span>}
                            </td>
                          );
                        })}
                        <td className="py-2"><Badge def={r.analysis.status === "aceptado" ? { label: "Revisado", tone: "success" } : { label: "Por revisar", tone: "warning" }} /></td>
                      </>
                    ) : (
                      <td colSpan={5 + reqNames.length} className="py-2 text-xs text-neutral-500">Sin análisis vigente</td>
                    )}
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr><td colSpan={6 + reqNames.length} className="py-6 text-center text-neutral-500">No hay postulaciones activas.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
