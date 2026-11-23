import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { getDefaultPipeline, listRequirementTemplates } from "@/modules/config/repository";
import { PipelinePanel, RequirementsPanel } from "@/modules/config/config-panels";
import { pagePermission } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Proceso estándar" };

export default async function ProcesosPage() {
  const { allowed } = await pagePermission("configuracion:gestionar");
  if (!allowed) return <Forbidden />;
  const [global, requirements] = await Promise.all([getDefaultPipeline(null), listRequirementTemplates(null)]);
  return (
    <>
      <PageHeader title="Proceso estándar y requisitos globales" description="Se aplican a los clientes que no tienen configuración propia." />
      <PipelinePanel clientId={null} own={global} fallback={null} canEdit />
      <RequirementsPanel clientId={null} rows={requirements.data} error={requirements.error} canEdit />
    </>
  );
}
