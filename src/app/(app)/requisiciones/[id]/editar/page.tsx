import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { RequisitionForm } from "@/modules/requisitions/requisition-form";
import { updateRequisitionAction } from "@/modules/requisitions/actions";
import { getRequisition } from "@/modules/requisitions/repository";
import { listAssignableUsers, listClientOptions } from "@/modules/common/options";
import { listJobPositions } from "@/modules/catalogs/repository";
import { pagePermission } from "@/lib/auth/guards";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "Editar requisición" };

export default async function EditarRequisicionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { allowed } = await pagePermission("requisiciones:editar");
  if (!allowed) return <Forbidden message="Solo administradores y coordinadores pueden editar requisiciones." />;
  const [requisition, clients, positions, users] = await Promise.all([getRequisition(id), listClientOptions(), listJobPositions(), listAssignableUsers()]);
  if (!requisition) notFound();
  return (
    <>
      <PageHeader title={`Editar: ${requisition.title}`} description={`${requisition.code} · el estado se cambia desde la ficha.`} />
      <RequisitionForm
        action={updateRequisitionAction}
        requisition={requisition}
        clients={clients.data}
        positions={positions.data}
        users={users.data}
        cancelHref={`/requisiciones/${id}`}
      />
    </>
  );
}
