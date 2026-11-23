import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { ClientForm } from "@/modules/clients/client-form";
import { updateClientAction } from "@/modules/clients/actions";
import { getClient, listAccountManagers } from "@/modules/clients/repository";
import { pagePermission } from "@/lib/auth/guards";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { allowed } = await pagePermission("clientes:editar");
  if (!allowed) return <Forbidden message="Solo administradores y coordinadores pueden editar clientes." />;
  const [client, managers] = await Promise.all([getClient(id), listAccountManagers()]);
  if (!client) notFound();
  return (
    <>
      <PageHeader title={`Editar: ${client.name}`} description="Actualice los datos del cliente." />
      <ClientForm action={updateClientAction} client={client} managers={managers.data} cancelHref={`/clientes/${id}`} />
    </>
  );
}
