import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Briefcase, Building2, ClipboardList, UserCheck, Users, Workflow, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { getDashboardMetrics } from "@/modules/dashboard/repository";
import { listApplications } from "@/modules/applications/repository";
import { listVacancies } from "@/modules/vacancies/repository";
import { APPLICATION_STAGE, PIPELINE_STAGES, VACANCY_STATUS } from "@/modules/labels";
import { formatDate, fullName } from "@/lib/format";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

function StatCard({ label, value, icon: Icon, href, highlight = false }: { label: string; value: number; icon: LucideIcon; href: string; highlight?: boolean }) {
  return (
    <Link
      href={href}
      className={`group rounded-xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        highlight ? "border-brand-700 bg-brand-600 text-white" : "border-neutral-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className={`text-sm font-medium ${highlight ? "text-brand-50" : "text-neutral-500"}`}>{label}</p>
        <div className={`rounded-lg p-2 ${highlight ? "bg-white/15" : "bg-brand-50 text-brand-600"}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight" data-testid={`kpi-${href.slice(1)}`}>{value}</p>
    </Link>
  );
}

export default async function DashboardPage() {
  const [user, metrics, applications, vacancies] = await Promise.all([
    requireSessionUser(),
    getDashboardMetrics(),
    listApplications(8),
    listVacancies(),
  ]);
  const m = metrics.data;
  const openVacancies = vacancies.data.filter((v) => v.status === "abierta").slice(0, 5);
  const stageCounts = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: applications.data.filter((a) => a.stage === stage).length,
  }));
  const maxStage = Math.max(1, ...stageCounts.map((s) => s.count));

  return (
    <>
      <PageHeader
        title={`Hola, ${user.fullName.split(" ")[0]}`}
        description="Resumen general del proceso de reclutamiento."
      />

      {metrics.error ? <Alert tone="error" className="mb-6">{metrics.error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Vacantes abiertas" value={m.open_vacancies} icon={Briefcase} href="/vacantes" highlight />
        <StatCard label="Postulaciones activas" value={m.active_applications} icon={Workflow} href="/postulaciones" />
        <StatCard label="Requisiciones abiertas" value={m.open_requisitions} icon={ClipboardList} href="/requisiciones" />
        <StatCard label="Candidatos en banco" value={m.total_candidates} icon={Users} href="/candidatos" />
        <StatCard label="Clientes activos" value={m.active_clients} icon={Building2} href="/clientes" />
        <StatCard label="Contrataciones del mes" value={m.hires_this_month} icon={UserCheck} href="/postulaciones" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Postulaciones recientes"
            description="Últimos movimientos en el proceso"
            action={
              <Link href="/postulaciones" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
                Ver todas <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          />
          {applications.data.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-neutral-500">Aún no hay postulaciones registradas.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {applications.data.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-950">{fullName(a.candidate)}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {a.vacancy?.title ?? "—"} · {formatDate(a.stage_changed_at)}
                    </p>
                  </div>
                  <Badge def={APPLICATION_STAGE[a.stage]} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Embudo de selección" description="Postulaciones por etapa" />
            <ul className="space-y-3 px-5 py-4">
              {stageCounts.map(({ stage, count }) => (
                <li key={stage}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-neutral-700">{APPLICATION_STAGE[stage].label}</span>
                    <span className="font-semibold text-ink-950">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100">
                    <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(count / maxStage) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Vacantes abiertas" />
            {openVacancies.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-neutral-500">No hay vacantes abiertas.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {openVacancies.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{v.title}</p>
                      <p className="truncate text-xs text-neutral-500">{v.requisition?.client?.name ?? "—"}</p>
                    </div>
                    <Badge def={VACANCY_STATUS[v.status]} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
