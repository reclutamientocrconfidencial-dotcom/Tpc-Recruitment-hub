import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { getAiSettings, listAiRequests } from "@/modules/ai/repository";
import { reviewAiAction } from "@/modules/ai/actions";
import { InlineAction } from "@/modules/common/inline-action";
import { InterviewScript, QuestionProposal } from "@/modules/interviews/script";
import {
  acceptQuestionsAction,
  applyConclusionsAction,
  deleteQuestionAction,
  generateConclusionsAction,
  generateQuestionsAction,
  saveQuestionAction,
} from "@/modules/interviews/actions";
import type { InterviewConclusions } from "@/lib/ai/features";
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
  const [a, iv, aiSettings, aiRequests] = await Promise.all([getApplication(id), getInterview(iid), getAiSettings(), listAiRequests({ interview_id: iid })]);
  if (!a || !iv || iv.application_id !== id) notFound();
  const name = `${a.candidate?.first_name ?? ""} ${a.candidate?.last_name ?? ""}`.trim();
  const scheduled = iv.status === "programada";
  const aiOn = Boolean(aiSettings?.enabled);
  const open = aiRequests.data.filter((r) => r.status === "pendiente_revision" || r.status === "aceptado");
  const proposals = open.filter((r) => r.feature === "preguntas_entrevista" && r.output);
  const conclusions = open.filter((r) => r.feature === "conclusiones_entrevista" && r.output);
  const path = `/postulaciones/${id}/entrevistas/${iid}`;
  return (
    <>
      <PageHeader
        title={`Entrevista: ${name}`}
        description={`${formatDateTime(iv.scheduled_at)} · ${INTERVIEW_KIND[iv.kind]} · ${iv.duration_min} min${iv.location ? ` · ${iv.location}` : ""} · ${iv.interviewer?.full_name ?? "Sin entrevistador"}`}
        actions={
          <>
            <Badge def={INTERVIEW_STATUS[iv.status]} />
            {iv.status === "programada" ? (
              <a href={`/api/entrevistas/${iv.id}/ics`} className={buttonClasses("ghost")}>
                Agregar a mi calendario
              </a>
            ) : null}
            <Link href={`/postulaciones/${id}`} className={buttonClasses("secondary")}>
              Volver a la postulación
            </Link>
          </>
        }
      />
      <Flash code={param(sp, "ok")} />
      {scheduled ? (
        <Card className="mb-6">
          <CardHeader title="Preparar el guion" description="Preguntas basadas en el CV, las funciones y requisitos de la vacante y los pendientes de la preselección. Edite, agregue o quite libremente." />
          <div className="px-5 py-4">
            <InterviewScript interviewId={iv.id} answers={iv.answers ?? []} save={saveQuestionAction} remove={deleteQuestionAction} />
          </div>
        </Card>
      ) : null}

      {aiOn ? (
        <Card className="mb-6">
          <CardHeader
            title="Asistente de entrevista"
            description="Propuestas de la IA con datos seudonimizados. Nada se agrega ni se escribe sin su revisión; se excluyen preguntas sobre temas personales ajenos al trabajo."
            action={<Sparkles className="h-5 w-5 text-brand-600" aria-hidden />}
          />
          <div className="flex flex-wrap gap-3 border-b border-neutral-100 px-5 py-4">
            {scheduled ? <InlineAction action={generateQuestionsAction} fields={{ interview_id: iv.id }} label="Proponer preguntas personalizadas" /> : null}
            <InlineAction action={generateConclusionsAction} fields={{ interview_id: iv.id }} label="Organizar respuestas y conclusiones" />
          </div>
          {proposals.map((r) => (
            <div key={r.id} className="space-y-2 border-b border-neutral-100 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Propuesta de preguntas · generada por IA · {r.status === "aceptado" ? "revisada" : "por revisar"}</p>
              {scheduled ? (
                <QuestionProposal action={acceptQuestionsAction} requestId={r.id} interviewId={iv.id} items={(r.output as { preguntas: Array<{ texto: string; competencia: string; objetivo: string; fundamento: string }> }).preguntas ?? []} />
              ) : null}
              {r.status === "pendiente_revision" ? <InlineAction action={reviewAiAction} fields={{ id: r.id, decision: "descartado", path }} label="Descartar propuesta" variant="ghost" /> : null}
            </div>
          ))}
          {conclusions.map((r) => {
            const c = r.output as unknown as InterviewConclusions;
            return (
              <div key={r.id} className="space-y-2 border-b border-neutral-100 px-5 py-4 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Borrador de conclusiones · generado por IA · verifique antes de usar</p>
                <p>{c.resumen}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {([["Evidencias", c.evidencias], ["Fortalezas", c.fortalezas], ["Aspectos por validar", c.aspectos_por_validar]] as const).map(([t, xs]) => (
                    <div key={t}>
                      <p className="font-semibold">{t}</p>
                      {xs.length ? <ul className="list-disc pl-5">{xs.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-neutral-500">—</p>}
                    </div>
                  ))}
                </div>
                <p><strong>Conclusión propuesta:</strong> {c.conclusion}</p>
                <div className="flex flex-wrap gap-2">
                  {!iv.summary?.trim() ? <InlineAction action={applyConclusionsAction} fields={{ id: r.id, interview_id: iv.id }} label="Usar como resumen de la entrevista" variant="secondary" /> : null}
                  {r.status === "pendiente_revision" ? <InlineAction action={reviewAiAction} fields={{ id: r.id, decision: "descartado", path }} label="Descartar" variant="ghost" /> : null}
                </div>
              </div>
            );
          })}
        </Card>
      ) : null}

      <Card className="p-5">
        <InterviewResultForm action={interviewResultAction} interview={iv} />
      </Card>
    </>
  );
}
