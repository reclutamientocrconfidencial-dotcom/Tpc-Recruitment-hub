import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { getClient } from "@/modules/clients/repository";
import { listClientsForCopy } from "@/modules/config/repository";
import { loadConfiguration } from "@/modules/config/load";
import { PipelinePanel, PositionProcessesPanel, RequirementsPanel } from "@/modules/config/config-panels";
import { CopyConfigForm } from "@/modules/config/copy-config-form";
import { copyClientConfigAction } from "@/modules/config/actions";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "Configuración del cliente" };

export default async function ClienteConfiguracionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [user, client, config, otherClients] = await Promise.all([
    requireSessionUser(),
    getClient(id),
    loadConfiguration(id),
    listClientsForCopy(id),
  ]);
  if (!client) notFound();
  const canEdit = can(user.role, "configuracion:gestionar");

  return (
    <>
      <PageHeader
        title={`Configuración: ${client.name}`}
        description="Procesos y requisitos para las vacantes de este cliente. Orden de prioridad: vacante → puesto del cliente → cliente → estándar TPC."
        actions={
          <Link href={`/clientes/${id}`} className={buttonClasses("secondary")}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Volver al cliente
          </Link>
        }
      />
      {canEdit && otherClients.data.length > 0 ? (
        <Card className="mb-6">
          <CardHeader title="Reutilizar configuración" description="Copie procesos y requisitos de otro cliente para agilizar el trabajo." />
          <div className="px-5 py-4">
            <CopyConfigForm action={copyClientConfigAction} clientId={id} clients={otherClients.data} />
          </div>
        </Card>
      ) : null}
      <PipelinePanel clientId={id} own={config.own} fallback={config.global} catalog={config.stageCatalog} canEdit={canEdit} />
      <PositionProcessesPanel
        clientId={id}
        pipelines={config.positionPipelines}
        baseTemplates={config.baseTemplates}
        catalog={config.stageCatalog}
        positions={config.positions}
        canEdit={canEdit}
      />
      <RequirementsPanel
        clientId={id}
        rows={config.requirements.data}
        error={config.requirements.error}
        canEdit={canEdit}
        catalog={config.reqCatalog}
        positions={config.positions}
        scales={config.scales}
      />
    </>
  );
}
