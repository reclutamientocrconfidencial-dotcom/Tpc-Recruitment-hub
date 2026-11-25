import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { Forbidden } from "@/components/ui/forbidden";
import { buttonClasses } from "@/components/ui/button";
import { getApplication } from "@/modules/applications/repository";
import { getInterview } from "@/modules/evaluations/repository";
import { interviewResultAction } from "@/modules/evaluations/actions";
import { InterviewResultForm } from "@/modules/evaluations/forms";
import { INTERVIEW_KIND, INTERVIEW_STATUS } from "@/modules/labels";
import { pagePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { param, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Entrevista" };

export default async function EntrevistaPage({ params, searchParams }: { params: Promise<{ id: string; iid: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ id, iid }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id) || !isUuid(iid)) notFound();
  const { allowed } = await pagePermission("postulaciones:editar");
  if (!allowed) return <Forbidden />;
  const [a, iv] = await Promise.all([getApplication(id), getInterview(iid)]);
  if (!a || !iv || iv.application_id !== id) notFound();
  const name = `${a.candidate?.first_name ?? ""} ${a.candidate?.last_name ?? ""}`.trim();
  return (
    <>
      <PageHeader
        title={`Entrevista: ${name}`}
        description={`${formatDateTime(iv.scheduled_at)} · ${INTERVIEW_KIND[iv.kind]} · ${iv.duration_min} min${iv.location ? ` · ${iv.location}` : ""} · ${iv.interviewer?.full_name ?? "Sin entrevistador"}`}
        actions={
          <>
            <Badge def={INTERVIEW_STATUS[iv.status]} />
            <Link href={`/postulaciones/${id}`} className={buttonClasses("secondary")}>
              Volver a la postulación
            </Link>
          </>
        }
      />
      <Flash code={param(sp, "ok")} />
      <Card className="p-5">
        <InterviewResultForm action={interviewResultAction} interview={iv} />
      </Card>
    </>
  );
}
