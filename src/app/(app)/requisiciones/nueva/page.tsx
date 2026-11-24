import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { RequisitionForm } from "@/modules/requisitions/requisition-form";
import { createRequisitionAction } from "@/modules/requisitions/actions";
import { listAssignableUsers, listClientOptions } from "@/modules/common/options";
import { listJobPositions } from "@/modules/catalogs/repository";
import { pagePermission } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Nueva requisición" };

export default async function NuevaRequisicionPage() {
  const { allowed } = await pagePermission("requisiciones:crear");
  if (!allowed) return <Forbidden message="Solo administradores y coordinadores pueden registrar requisiciones." />;
  const [clients, positions, users] = await Promise.all([listClientOptions(), listJobPositions(), listAssignableUsers()]);
  return (
    <>
      <PageHeader title="Nueva requisición" description="Inicia en borrador o pendiente de aprobación. Los campos con * son obligatorios." />
      <RequisitionForm action={createRequisitionAction} clients={clients.data} positions={positions.data} users={users.data} cancelHref="/requisiciones" />
    </>
  );
}
