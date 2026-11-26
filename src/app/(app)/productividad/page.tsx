import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { Field, TextInput } from "@/components/ui/form";
import { Forbidden } from "@/components/ui/forbidden";
import { getProductivity } from "@/modules/workday/repository";
import { todayCR } from "@/modules/evaluations/repository";
import { pagePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { param, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Productividad" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ProductividadPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { user, allowed } = await pagePermission("jornada:ver");
  if (!allowed) return <Forbidden message="Los indicadores de productividad no están disponibles para su rol." />;
  const sp = await searchParams;
  const to = DATE_RE.test(param(sp, "hasta")) ? param(sp, "hasta") : todayCR();
  const from = DATE_RE.test(param(sp, "desde")) ? param(sp, "desde") : new Date(Date.parse(`${to}T12:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const { rows, error } = await getProductivity(from, to);
  const team = can(user.role, "configuracion:gestionar");
  return (
    <>
      <PageHeader title="Indicadores de gestión y productividad" description={team ? "Equipo completo (administración y coordinación)." : "Sus propios indicadores."} />
      <FilterBar path="/productividad" active={Boolean(param(sp, "desde") || param(sp, "hasta"))}>
        <Field id="desde" label="Desde">
          <TextInput id="desde" type="date" defaultValue={from} />
        </Field>
        <Field id="hasta" label="Hasta">
          <TextInput id="hasta" type="date" defaultValue={to} />
        </Field>
      </FilterBar>
      <DataTable
        caption="Indicadores por responsable"
        rows={rows.map((r) => ({ ...r, id: r.user_id }))}
        error={error}
        emptyTitle="Sin datos"
        emptyDescription="No hay actividad en el período."
        columns={[
          { header: "Responsable", cell: (r) => <span className="font-semibold">{r.full_name}</span> },
          { header: "Postulaciones creadas", cell: (r) => r.applications_created, className: "text-center" },
          { header: "Movimientos de etapa", cell: (r) => r.stage_moves, className: "text-center" },
          { header: "Entrevistas realizadas", cell: (r) => r.interviews_done, className: "text-center" },
          { header: "Informes finalizados", cell: (r) => r.reports_finalized, className: "text-center" },
          { header: "Contrataciones", cell: (r) => r.hires, className: "text-center" },
          { header: "Días promedio a contratación", cell: (r) => (r.avg_days_to_hire != null ? String(r.avg_days_to_hire).replace(".", ",") : "—"), className: "text-center" },
          { header: "Tareas hechas", cell: (r) => r.tasks_done, className: "text-center" },
          { header: "Tareas vencidas", cell: (r) => <span className={r.tasks_overdue ? "font-semibold text-brand-700" : ""}>{r.tasks_overdue}</span>, className: "text-center" },
        ]}
      />
      <p className="mt-3 text-xs text-neutral-500">Período {from} a {to} (hora de Costa Rica). Máximo un año.</p>
    </>
  );
}
