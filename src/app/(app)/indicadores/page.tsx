import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { FilterBar } from "@/components/ui/filter-bar";
import { Field, SelectInput, TextInput } from "@/components/ui/form";
import { Forbidden } from "@/components/ui/forbidden";
import { getAnalytics } from "@/modules/analytics/repository";
import { BarTable } from "@/modules/analytics/bars";
import { ExportForm } from "@/modules/analytics/export-form";
import { listClientOptions } from "@/modules/common/options";
import { todayCR } from "@/modules/evaluations/repository";
import { DISCARD_REASON, STAGE_CATEGORY } from "@/modules/labels";
import { pagePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/ids";
import { param, type RawSearchParams } from "@/lib/search-params";
import type { DiscardReason, StageCategory } from "@/types/database";

export const metadata: Metadata = { title: "Indicadores" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (n: number | null | undefined, suffix = "") => (n == null ? "—" : `${String(n).replace(".", ",")}${suffix}`);

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink-950">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

export default async function IndicadoresPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { user, allowed } = await pagePermission("indicadores:ver");
  if (!allowed) return <Forbidden />;
  const sp = await searchParams;
  const to = DATE_RE.test(param(sp, "hasta")) ? param(sp, "hasta") : todayCR();
  const from = DATE_RE.test(param(sp, "desde")) ? param(sp, "desde") : new Date(Date.parse(`${to}T12:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
  const clientId = isUuid(param(sp, "cliente")) ? param(sp, "cliente") : "";
  const [a, clients] = await Promise.all([getAnalytics({ from, to, clientId }), listClientOptions()]);
  const s = a.summary;
  const exportMessage = param(sp, "exportacion");
  const coverage = s && s.openings_open ? Math.round((s.filled_open / s.openings_open) * 100) : null;
  const funnelOrder: StageCategory[] = ["nuevo", "en_proceso", "contratado", "descartado"];
  return (
    <>
      <PageHeader
        title="Indicadores gerenciales"
        description={s?.scope === "propio" ? "Sus postulaciones y vacantes asignadas." : "Tablero ejecutivo de reclutamiento. Datos agregados, sin información personal."}
      />
      <FilterBar path="/indicadores" active={Boolean(param(sp, "desde") || param(sp, "hasta") || clientId)}>
        <Field id="desde" label="Desde">
          <TextInput id="desde" type="date" defaultValue={from} />
        </Field>
        <Field id="hasta" label="Hasta">
          <TextInput id="hasta" type="date" defaultValue={to} />
        </Field>
        <Field id="cliente" label="Cliente">
          <SelectInput id="cliente" defaultValue={clientId} placeholder="Todos" options={clients.data.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
      </FilterBar>
      {exportMessage ? <Alert tone="error" className="mb-4">{exportMessage}</Alert> : null}
      {a.error ? <Alert tone="error" className="mb-4">{a.error}</Alert> : null}

      <section aria-label="Resumen ejecutivo" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Requisiciones abiertas" value={s?.open_requisitions ?? "—"} />
        <Kpi label="Vacantes abiertas" value={s?.open_vacancies ?? "—"} hint={s?.overdue_vacancies ? `${s.overdue_vacancies} con fecha de cierre vencida` : undefined} />
        <Kpi label="Cobertura de plazas abiertas" value={coverage == null ? "—" : `${coverage} %`} hint={s ? `${s.filled_open} de ${s.openings_open} plazas` : undefined} />
        <Kpi label="En proceso" value={s?.active_pipeline ?? "—"} hint="Postulaciones activas" />
        <Kpi label="Postulaciones del período" value={s?.applications ?? "—"} />
        <Kpi label="Contrataciones del período" value={s?.hires ?? "—"} />
        <Kpi label="Días promedio a contratación" value={num(s?.avg_days_to_hire)} hint="Desde la postulación" />
        <Kpi label="Conversión" value={s && s.applications ? `${num(Math.round((s.hires / s.applications) * 1000) / 10)} %` : "—"} hint="Contrataciones / postulaciones" />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Embudo del período" description="Postulaciones del período según su etapa actual." />
          <BarTable
            caption="Embudo por tipo de etapa"
            label="Tipo de etapa"
            valueHeader="Postulaciones"
            rows={funnelOrder.map((k) => ({ key: k, label: STAGE_CATEGORY[k].label, value: a.funnel?.by_category[k] ?? 0 }))}
          />
        </Card>
        <Card>
          <CardHeader title="Motivos de descarte" />
          <BarTable
            caption="Motivos de descarte"
            label="Motivo"
            valueHeader="Postulaciones"
            rows={(a.funnel?.discard_reasons ?? []).map((d) => ({ key: d.reason, label: DISCARD_REASON[d.reason as DiscardReason] ?? d.reason, value: d.count }))}
          />
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Tiempos por etapa" description="Días de permanencia en etapas ya concluidas en el período (promedio, mediana y objetivo)." />
        <BarTable
          caption="Tiempos por etapa"
          label="Etapa"
          valueHeader="Días promedio"
          extraHeaders={["Mediana", "Objetivo", "Postulaciones"]}
          rows={a.stages.map((t) => ({
            key: `${t.stage_name}-${t.category}`,
            label: t.stage_name,
            value: Number(t.avg_days ?? 0),
            valueLabel: num(t.avg_days),
            extra: [num(t.median_days), num(t.target_days), t.transitions],
            tooltip: `${t.stage_name}: promedio ${num(t.avg_days)} días, mediana ${num(t.median_days)}${t.target_days != null ? `, objetivo ${num(t.target_days)}` : ""}`,
          }))}
        />
      </Card>

      <Card className="mt-6">
        <CardHeader title="Fuentes más efectivas" description="Por canal de recepción: contrataciones, postulaciones y tasa de contratación." />
        <BarTable
          caption="Fuentes de recepción"
          label="Fuente"
          valueHeader="Contrataciones"
          extraHeaders={["Postulaciones", "Tasa", "Días a contratación"]}
          rows={a.sources.map((r) => ({ key: r.source, label: r.source, value: r.hires, extra: [r.applications, num(r.hire_rate, " %"), num(r.avg_days_to_hire)] }))}
        />
      </Card>

      <div className="mt-6 grid gap-6">
        <Card>
          <CardHeader title="Desempeño por reclutador" description={s?.scope === "propio" ? "Sus indicadores." : undefined} />
          <BarTable
            caption="Desempeño por reclutador"
            label="Responsable"
            valueHeader="Contrataciones"
            extraHeaders={["Activas", "Postulaciones", "Entrevistas", "Días a contratación"]}
            rows={a.recruiters.map((r) => ({ key: r.recruiter_id, label: r.full_name, value: r.hires, extra: [r.active_applications, r.applications, r.interviews_done, num(r.avg_days_to_hire)] }))}
          />
        </Card>
        <Card>
          <CardHeader title="Desempeño por cliente" />
          <BarTable
            caption="Desempeño por cliente"
            label="Cliente"
            valueHeader="Contrataciones"
            extraHeaders={["Vacantes", "Plazas cubiertas", "Vencidas", "Días a contratación"]}
            rows={a.clients.map((c) => ({ key: c.client_id, label: c.client_name, value: c.hires, extra: [c.open_vacancies, `${c.filled}/${c.openings}`, c.overdue_vacancies, num(c.avg_days_to_hire)] }))}
          />
        </Card>
      </div>

      {can(user.role, "exportaciones:crear") ? (
        <Card className="mt-6">
          <CardHeader title="Exportaciones controladas" description="Para informes a la gerencia o a clientes. Requiere motivo y queda registrada." />
          <div className="px-5 py-5">
            <ExportForm from={from} to={to} clientId={clientId} isAdmin={can(user.role, "usuarios:gestionar")} />
          </div>
        </Card>
      ) : null}
    </>
  );
}
