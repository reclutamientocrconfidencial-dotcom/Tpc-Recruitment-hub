import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { ClientForm } from "@/modules/clients/client-form";
import { createClientAction } from "@/modules/clients/actions";
import { listAccountManagers } from "@/modules/clients/repository";
import { pagePermission } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function NuevoClientePage() {
  const { allowed } = await pagePermission("clientes:crear");
  if (!allowed) return <Forbidden message="Solo administradores y coordinadores pueden registrar clientes." />;
  const managers = await listAccountManagers();
  return (
    <>
      <PageHeader title="Nuevo cliente" description="Registre una empresa cliente. Los campos con * son obligatorios." />
      <ClientForm action={createClientAction} managers={managers.data} cancelHref="/clientes" />
    </>
  );
}
