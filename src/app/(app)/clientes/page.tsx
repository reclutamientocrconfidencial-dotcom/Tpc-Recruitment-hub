import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { CreateButton } from "@/components/ui/create-button";
import { listClients } from "@/modules/clients/repository";
import { CLIENT_STATUS } from "@/modules/labels";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage() {
  const [user, { data, error }] = await Promise.all([requireSessionUser(), listClients()]);
  return (
    <>
      <PageHeader
        title="Clientes"
        description="Empresas para las que TPC gestiona procesos de reclutamiento."
        actions={<CreateButton label="Nuevo cliente" allowed={can(user.role, "clientes:crear")} />}
      />
      <DataTable
        caption="Listado de clientes"
        rows={data}
        error={error}
        emptyTitle="Sin clientes registrados"
        emptyDescription="Los clientes que registre aparecerán aquí."
        columns={[
          { header: "Empresa", cell: (c) => <span className="font-semibold text-ink-950">{c.name}</span> },
          { header: "Cédula jurídica", cell: (c) => c.legal_id ?? "—" },
          { header: "Industria", cell: (c) => c.industry ?? "—" },
          { header: "Contacto", cell: (c) => c.contact_name ?? "—" },
          { header: "Provincia", cell: (c) => c.province ?? "—" },
          { header: "Estado", cell: (c) => <Badge def={CLIENT_STATUS[c.status]} /> },
        ]}
      />
    </>
  );
}
