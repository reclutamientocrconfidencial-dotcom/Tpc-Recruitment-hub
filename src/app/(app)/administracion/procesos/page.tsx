import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { loadConfiguration } from "@/modules/config/load";
import { PipelinePanel, PositionProcessesPanel, RequirementsPanel } from "@/modules/config/config-panels";
import { pagePermission } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Proceso estándar" };

export default async function ProcesosPage() {
  const { allowed } = await pagePermission("configuracion:gestionar");
  if (!allowed) return <Forbidden />;
  const config = await loadConfiguration(null);
  return (
    <>
      <PageHeader title="Proceso estándar y requisitos globales" description="Se aplican a los clientes que no tienen configuración propia." />
      <PipelinePanel clientId={null} own={config.global} fallback={null} catalog={config.stageCatalog} canEdit />
      <PositionProcessesPanel
        clientId={null}
        pipelines={config.positionPipelines}
        baseTemplates={config.baseTemplates}
        catalog={config.stageCatalog}
        positions={config.positions}
        canEdit
      />
      <RequirementsPanel
        clientId={null}
        rows={config.requirements.data}
        error={config.requirements.error}
        canEdit
        catalog={config.reqCatalog}
        positions={config.positions}
        scales={config.scales}
      />
    </>
  );
}
