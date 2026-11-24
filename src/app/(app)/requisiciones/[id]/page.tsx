import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { buttonClasses } from "@/components/ui/button";
import { getRequisition } from "@/modules/requisitions/repository";
import { listRequisitionVacancies } from "@/modules/vacancies/repository";
import { changeRequisitionStatusAction } from "@/modules/requisitions/actions";
import { StatusActions } from "@/modules/common/status-actions";
import { CoverageBar } from "@/modules/common/coverage-bar";
import { PRIORITY, REQUISITION_STATUS, VACANCY_STATUS, WORK_MODALITY } from "@/modules/labels";
import { isOverdue, REQUISITION_ACCEPTS_VACANCIES, REQUISITION_ACTION_LABEL, REQUISITION_TRANSITIONS } from "@/modules/workflow";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatSalaryRange } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { param, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Requisición" };

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-950">{value || "—"}</dd>
    </div>
  );
}

export default async function RequisicionDetallePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const [user, r, vacancies] = await Promise.all([requireSessionUser(), getRequisition(id), listRequisitionVacancies(id)]);
  if (!r) notFound();

  const canEdit = can(user.role, "requisiciones:editar");
  const closed = r.status === "cerrada" || r.status === "cancelada";
  const canCreateVacancy = can(user.role, "vacantes:crear") && REQUISITION_ACCEPTS_VACANCIES.includes(r.status);
  const totals = vacancies.data.reduce((acc, v) => ({ openings: acc.openings + v.openings, filled: acc.filled + (v.filled_count ?? 0) }), { openings: 0, filled: 0 });
  const transitions = canEdit
    ? REQUISITION_TRANSITIONS[r.status].map((s) => ({
        status: s,
        label: REQUISITION_ACTION_LABEL[s] ?? s,
        variant: (s === "aprobada" || s === "pendiente_aprobacion" ? "primary" : s === "cancelada" ? "ghost" : "secondary") as "primary" | "ghost" | "secondary",
      }))
    : [];
  const overdue = !closed && isOverdue(r.target_date);

  return (
    <>
      <PageHeader
        title={r.title}
        description={`${r.code} · ${r.client?.name ?? "Cliente"}`}
        actions={
          <>
            {canEdit && !closed ? (
              <Link href={`/requisiciones/${id}/editar`} className={buttonClasses("secondary")}>
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </Link>
            ) : null}
            {canCreateVacancy ? (
              <Link href={`/vacantes/nueva?requisicion=${id}`} className={buttonClasses("primary")}>
                <Plus className="h-4 w-4" aria-hidden /> Nueva vacante
              </Link>
            ) : null}
          </>
        }
      />
      <Flash code={param(sp, "ok")} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Datos de la requisición" action={<Badge def={REQUISITION_STATUS[r.status]} />} />
          <dl className="grid gap-5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
            <Item label="Cliente" value={r.client ? <Link className="text-brand-600 hover:underline" href={`/clientes/${r.client.id}`}>{r.client.name}</Link> : null} />
            <Item label="Puesto (catálogo)" value={r.position?.name} />
            <Item label="Departamento" value={r.department} />
            <Item label="Plazas solicitadas" value={r.positions_count} />
            <Item label="Prioridad" value={<Badge def={PRIORITY[r.priority]} />} />
            <Item label="Fecha límite" value={r.target_date ? <span className={overdue ? "font-semibold text-brand-700" : ""}>{formatDate(r.target_date)}{overdue ? " · vencida" : ""}</span> : null} />
            <Item label="Provincia" value={r.province} />
            <Item label="Modalidad" value={r.modality ? WORK_MODALITY[r.modality] : null} />
            <Item label="Horario" value={r.work_schedule} />
            <Item label="Salario" value={formatSalaryRange(r.salary_min, r.salary_max, r.currency)} />
            <Item label="Responsable" value={r.recruiter?.full_name} />
            <Item label="Solicitado por" value={r.requested_by_name} />
            <Item label="Aprobada" value={r.approved_at ? `${formatDate(r.approved_at)}${r.approver?.full_name ? ` · ${r.approver.full_name}` : ""}` : null} />
            <Item label="Registrada" value={formatDate(r.created_at)} />
            <div className="sm:col-span-2 lg:col-span-3">
              <Item label="Justificación" value={r.justification ? <span className="whitespace-pre-line">{r.justification}</span> : null} />
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Flujo de aprobación" description="La base de datos valida cada cambio y registra quién aprueba." />
          <div className="space-y-4 px-5 py-5">
            <ol className="flex flex-wrap gap-1 text-xs" aria-label="Etapas del flujo">
              {(["borrador", "pendiente_aprobacion", "aprobada", "en_proceso", "cerrada"] as const).map((s) => (
                <li key={s} className={`rounded px-2 py-1 ${r.status === s ? "bg-brand-600 font-semibold text-white" : "bg-neutral-100 text-neutral-600"}`}>
                  {REQUISITION_STATUS[s].label}
                </li>
              ))}
            </ol>
            {transitions.length > 0 ? (
              <StatusActions
                action={changeRequisitionStatusAction}
                id={r.id}
                options={transitions}
                confirm={{ cancelada: "¿Cancelar esta requisición? Podrá consultarse, pero no reabrirse.", cerrada: "¿Cerrar esta requisición?" }}
              />
            ) : (
              <p className="text-sm text-neutral-500">{canEdit ? "No hay cambios de estado disponibles." : "Solo administración o coordinación cambia el estado."}</p>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Vacantes y plazas"
          description={`${r.positions_count} plazas solicitadas · ${totals.openings} en vacantes · ${totals.filled} cubiertas · ${Math.max(0, r.positions_count - totals.filled)} pendientes`}
        />
        {vacancies.error ? <p className="px-5 py-4 text-sm text-brand-700">{vacancies.error}</p> : null}
        {vacancies.data.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">
            {REQUISITION_ACCEPTS_VACANCIES.includes(r.status) ? "Aún no hay vacantes para esta requisición." : "Las vacantes se crean cuando la requisición está aprobada."}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {vacancies.data.map((v) => (
              <li key={v.id} className="grid items-center gap-3 px-5 py-3 sm:grid-cols-[1fr_12rem_auto]">
                <div className="min-w-0">
                  <Link href={`/vacantes/${v.id}`} className="truncate text-sm font-semibold text-ink-950 hover:text-brand-600 hover:underline">
                    {v.title}
                  </Link>
                  <p className="font-mono text-xs text-neutral-500">
                    {v.code} · {v.recruiter?.full_name ?? "Sin responsable"}
                  </p>
                </div>
                <CoverageBar openings={v.openings} filled={v.filled_count ?? 0} compact />
                <Badge def={VACANCY_STATUS[v.status]} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
