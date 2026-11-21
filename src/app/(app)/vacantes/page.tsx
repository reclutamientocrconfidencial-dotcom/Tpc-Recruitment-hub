import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { CreateButton } from "@/components/ui/create-button";
import { listVacancies } from "@/modules/vacancies/repository";
import { VACANCY_STATUS, WORK_MODALITY } from "@/modules/labels";
import { formatDate, formatSalaryRange } from "@/lib/format";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Vacantes" };

export default async function VacantesPage() {
  const [user, { data, error }] = await Promise.all([requireSessionUser(), listVacancies()]);
  return (
    <>
      <PageHeader
        title="Vacantes"
        description="Puestos publicados a partir de las requisiciones aprobadas."
        actions={<CreateButton label="Nueva vacante" allowed={can(user.role, "vacantes:crear")} />}
      />
      <DataTable
        caption="Listado de vacantes"
        rows={data}
        error={error}
        emptyTitle="Sin vacantes"
        emptyDescription="No hay vacantes visibles para su usuario."
        columns={[
          { header: "Código", cell: (v) => <span className="font-mono text-xs font-semibold">{v.code}</span> },
          { header: "Puesto", cell: (v) => <span className="font-semibold text-ink-950">{v.title}</span> },
          { header: "Cliente", cell: (v) => v.requisition?.client?.name ?? "—" },
          { header: "Ubicación", cell: (v) => `${v.province ?? "—"} · ${WORK_MODALITY[v.modality]}` },
          { header: "Salario", cell: (v) => formatSalaryRange(v.salary_min, v.salary_max, v.currency) },
          { header: "Estado", cell: (v) => <Badge def={VACANCY_STATUS[v.status]} /> },
          { header: "Publicada", cell: (v) => formatDate(v.published_at) },
        ]}
      />
    </>
  );
}
