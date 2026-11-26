import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { CandidateForm } from "@/modules/candidates/candidate-form";
import { saveCandidateAction } from "@/modules/candidates/actions";
import { getActiveConsentText, listCantons } from "@/modules/candidates/repository";
import { listJobPositions } from "@/modules/catalogs/repository";
import { listIntakeChannels } from "@/modules/config/repository";
import { listAssignableUsers } from "@/modules/common/options";
import { pagePermission } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Nuevo candidato" };

export default async function NuevoCandidatoPage() {
  const { allowed } = await pagePermission("candidatos:crear");
  if (!allowed) return <Forbidden message="Su rol no permite registrar candidatos." />;
  const [cantons, positions, channels, users, consent] = await Promise.all([listCantons(), listJobPositions(), listIntakeChannels(true), listAssignableUsers(), getActiveConsentText()]);
  return (
    <>
      <PageHeader title="Nuevo candidato" description="Se verifican posibles duplicados antes de guardar. Los campos con * son obligatorios." />
      <CandidateForm
        action={saveCandidateAction}
        cantons={cantons.data}
        positions={positions.data}
        channels={channels.data}
        users={users.data}
        consentText={consent}
        cancelHref="/candidatos"
      />
    </>
  );
}
