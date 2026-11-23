import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClasses } from "@/components/ui/button";
import { getClient } from "@/modules/clients/repository";
import { getDefaultPipeline, listRequirementTemplates } from "@/modules/config/repository";
import { PipelinePanel, RequirementsPanel } from "@/modules/config/config-panels";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "Configuración del cliente" };

export default async function ClienteConfiguracionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [user, client, own, global, requirements] = await Promise.all([
    requireSessionUser(),
    getClient(id),
    getDefaultPipeline(id),
    getDefaultPipeline(null),
    listRequirementTemplates(id),
  ]);
  if (!client) notFound();
  const canEdit = can(user.role, "configuracion:gestionar");

  return (
    <>
      <PageHeader
        title={`Configuración: ${client.name}`}
        description="Etapas del proceso y requisitos predeterminados para las vacantes de este cliente."
        actions={
          <Link href={`/clientes/${id}`} className={buttonClasses("secondary")}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Volver al cliente
          </Link>
        }
      />
      <PipelinePanel clientId={id} own={own} fallback={global} canEdit={canEdit} />
      <RequirementsPanel clientId={id} rows={requirements.data} error={requirements.error} canEdit={canEdit} />
    </>
  );
}
