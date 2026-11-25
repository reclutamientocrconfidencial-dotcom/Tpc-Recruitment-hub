import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { CandidateForm } from "@/modules/candidates/candidate-form";
import { saveCandidateAction } from "@/modules/candidates/actions";
import { getCandidate, getCandidatePrivate, listCantons } from "@/modules/candidates/repository";
import { listJobPositions } from "@/modules/catalogs/repository";
import { listIntakeChannels } from "@/modules/config/repository";
import { listAssignableUsers } from "@/modules/common/options";
import { pagePermission } from "@/lib/auth/guards";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "Editar candidato" };

export default async function EditarCandidatoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { allowed } = await pagePermission("candidatos:editar");
  if (!allowed) return <Forbidden message="Su rol no permite editar candidatos." />;
  const candidate = await getCandidate(id);
  if (!candidate || candidate.status === "fusionado") notFound();
  const [priv, cantons, positions, channels, users] = await Promise.all([
    getCandidatePrivate(id, "Edición de la ficha"),
    listCantons(),
    listJobPositions(),
    listIntakeChannels(),
    listAssignableUsers(),
  ]);
  if (!priv) return <Forbidden message="Solo puede editar candidatos propios o de sus vacantes asignadas." />;
  return (
    <>
      <PageHeader title={`Editar: ${candidate.first_name} ${candidate.last_name}`} description="Los cambios quedan registrados (quién y cuándo)." />
      <CandidateForm
        action={saveCandidateAction}
        candidate={candidate}
        priv={priv}
        cantons={cantons.data}
        positions={positions.data}
        channels={channels.data}
        users={users.data}
        consentText={null}
        cancelHref={`/candidatos/${id}`}
      />
    </>
  );
}
