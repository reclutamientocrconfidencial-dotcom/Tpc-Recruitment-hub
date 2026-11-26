import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Forbidden } from "@/components/ui/forbidden";
import { buttonClasses } from "@/components/ui/button";
import { getSubmission } from "@/modules/intake/repository";
import { reviewSubmissionAction } from "@/modules/intake/actions";
import { ReviewForm } from "@/modules/intake/admin-forms";
import { SUBMISSION_STATUS } from "@/modules/labels";
import { pagePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatBytes } from "@/lib/files";
import { formatDate, formatDateTime } from "@/lib/format";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "Envío recibido" };

const DATA_LABELS: Array<[string, string]> = [
  ["first_name", "Nombre"],
  ["last_name", "Apellidos"],
  ["email", "Correo"],
  ["phone", "Teléfono"],
  ["national_id", "Identificación"],
  ["province", "Provincia"],
  ["canton", "Cantón"],
  ["district", "Distrito"],
  ["current_title", "Ocupación"],
  ["years_experience", "Años de experiencia"],
];

export default async function EnvioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { user, allowed } = await pagePermission("recepcion:ver");
  if (!allowed) return <Forbidden message="La bandeja de recepción no está disponible para su rol." />;
  const s = await getSubmission(id);
  if (!s) notFound();
  const canReview = s.status === "revision" && can(user.role, "candidatos:editar");
  return (
    <>
      <PageHeader title={s.full_name} description={`Recibido ${formatDateTime(s.created_at)} · ${s.form?.title ?? "Formulario"}`} actions={<Badge def={SUBMISSION_STATUS[s.status]} />} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Datos enviados" description={s.data ? "Se eliminan de la bandeja al resolver el envío." : "Ya se trasladaron a la ficha del candidato o se eliminaron."} />
            {s.data ? (
              <dl className="grid gap-4 px-5 py-5 sm:grid-cols-2">
                {DATA_LABELS.filter(([k]) => s.data?.[k]).map(([k, label]) => (
                  <div key={k}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
                    <dd className="mt-1 text-sm">{s.data?.[k]}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="px-5 py-5 text-sm text-neutral-600">
                {s.candidate_id ? (
                  <Link href={`/candidatos/${s.candidate_id}`} className="font-semibold text-brand-700 hover:underline">
                    Abrir la ficha del candidato
                  </Link>
                ) : (
                  "Envío descartado: sin datos personales."
                )}
                {s.application_id ? (
                  <>
                    {" · "}
                    <Link href={`/postulaciones/${s.application_id}`} className="font-semibold text-brand-700 hover:underline">
                      Ver la postulación
                    </Link>
                  </>
                ) : null}
              </p>
            )}
          </Card>
          <Card>
            <CardHeader title="Preguntas de preselección" description={s.preselection_ok == null ? "Sin criterios eliminatorios." : s.preselection_ok ? "Cumple todos los criterios." : "No cumple al menos un criterio."} />
            {s.answers && s.answers.length > 0 ? (
              <ul className="divide-y divide-neutral-100">
                {s.answers.map((a) => (
                  <li key={a.position} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <span>
                      <span className="font-medium">{a.question_label}</span>
                      <span className="ml-2 text-neutral-600">{a.answer === "si" ? "Sí" : a.answer === "no" ? "No" : (a.answer ?? "—")}</span>
                    </span>
                    {a.meets == null ? null : a.meets ? <Badge def={{ label: "Cumple", tone: "success" }} /> : <Badge def={{ label: "No cumple", tone: "warning" }} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-5 text-sm text-neutral-500">El formulario no tenía preguntas.</p>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          {s.status === "revision" ? (
            <Card>
              <CardHeader title="Posible duplicado" description="Decida antes de incorporar." />
              <div className="space-y-4 px-5 py-5">
                {s.match ? (
                  <Alert>
                    Coincide por <strong>{s.match_reasons.join(", ")}</strong> con{" "}
                    <Link href={`/candidatos/${s.match.id}`} className="font-semibold underline" target="_blank">
                      {s.match.first_name} {s.match.last_name}
                    </Link>
                    . Compare antes de decidir.
                  </Alert>
                ) : null}
                {canReview ? <ReviewForm action={reviewSubmissionAction} submissionId={s.id} matchId={s.match?.id ?? null} /> : <p className="text-sm text-neutral-500">Su rol no permite resolver envíos.</p>}
              </div>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Recepción" />
            <dl className="space-y-3 px-5 py-5 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Vacante</dt>
                <dd>{s.vacancy ? <Link href={`/vacantes/${s.vacancy.id}`} className="hover:underline">{s.vacancy.code} · {s.vacancy.title}</Link> : "Banco de talento"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Canal</dt>
                <dd>{[s.channel?.name, s.link?.label].filter(Boolean).join(" · ") || "—"} <span className="font-mono text-xs text-neutral-500">{s.link?.code}</span></dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Consentimiento (evidencia)</dt>
                <dd className="text-xs">{s.consent_evidence}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Currículum</dt>
                <dd>
                  {s.cv_path && s.status !== "descartado" ? (
                    <a href={`/api/recepcion/${s.id}/cv`} className={buttonClasses("secondary")}>
                      <Download className="h-4 w-4" aria-hidden /> Descargar ({s.cv_size ? formatBytes(s.cv_size) : ""})
                    </a>
                  ) : (
                    "Sin currículum"
                  )}
                  {s.cv_path ? <p className="mt-1 text-xs text-neutral-500">La descarga queda registrada.</p> : null}
                </dd>
              </div>
              {s.reviewed_at ? (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Revisión</dt>
                  <dd>
                    {formatDate(s.reviewed_at)} {s.reviewer?.full_name ? `por ${s.reviewer.full_name}` : ""} {s.review_note ? `· ${s.review_note}` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
