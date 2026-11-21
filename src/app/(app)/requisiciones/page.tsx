import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { CreateButton } from "@/components/ui/create-button";
import { listRequisitions } from "@/modules/requisitions/repository";
import { PRIORITY, REQUISITION_STATUS } from "@/modules/labels";
import { formatDate, formatSalaryRange } from "@/lib/format";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Requisiciones" };

export default async function RequisicionesPage() {
  const [user, { data, error }] = await Promise.all([requireSessionUser(), listRequisitions()]);
  return (
    <>
      <PageHeader
        title="Requisiciones"
        description="Solicitudes de personal emitidas por los clientes."
        actions={<CreateButton label="Nueva requisición" allowed={can(user.role, "requisiciones:crear")} />}
      />
      <DataTable
        caption="Listado de requisiciones"
        rows={data}
        error={error}
        emptyTitle="Sin requisiciones"
        emptyDescription="No hay requisiciones visibles para su usuario."
        columns={[
          { header: "Código", cell: (r) => <span className="font-mono text-xs font-semibold">{r.code}</span> },
          { header: "Puesto", cell: (r) => <span className="font-semibold text-ink-950">{r.title}</span> },
          { header: "Cliente", cell: (r) => r.client?.name ?? "—" },
          { header: "Plazas", cell: (r) => r.positions_count, className: "text-center" },
          { header: "Salario", cell: (r) => formatSalaryRange(r.salary_min, r.salary_max, r.currency) },
          { header: "Prioridad", cell: (r) => <Badge def={PRIORITY[r.priority]} /> },
          { header: "Estado", cell: (r) => <Badge def={REQUISITION_STATUS[r.status]} /> },
          { header: "Fecha meta", cell: (r) => formatDate(r.target_date) },
        ]}
      />
    </>
  );
}
