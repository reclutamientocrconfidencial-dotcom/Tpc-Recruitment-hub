import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Forbidden } from "@/components/ui/forbidden";
import { getApplication } from "@/modules/applications/repository";
import { listAssignableUsers } from "@/modules/common/options";
import { scheduleInterviewAction } from "@/modules/evaluations/actions";
import { ScheduleInterviewForm } from "@/modules/evaluations/forms";
import { pagePermission } from "@/lib/auth/guards";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "Programar entrevista" };

export default async function NuevaEntrevistaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { user, allowed } = await pagePermission("postulaciones:editar");
  if (!allowed) return <Forbidden />;
  const [a, users] = await Promise.all([getApplication(id), listAssignableUsers()]);
  if (!a) notFound();
  const name = `${a.candidate?.first_name ?? ""} ${a.candidate?.last_name ?? ""}`.trim();
  return (
    <>
      <PageHeader title="Programar entrevista" description={`${name} · ${a.vacancy?.code ?? ""} ${a.vacancy?.title ?? ""}`} />
      <Card className="max-w-3xl p-5">
        <p className="mb-4 text-sm text-neutral-600">
          El guion se arma automáticamente con las preguntas activas del banco: generales, del puesto de la vacante y del cliente.
        </p>
        <ScheduleInterviewForm action={scheduleInterviewAction} applicationId={id} defaultInterviewer={user.id} users={users.data.map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
      </Card>
    </>
  );
}
