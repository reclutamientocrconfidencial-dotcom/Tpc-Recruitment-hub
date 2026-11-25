import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KanbanSquare } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Flash } from "@/components/ui/flash";
import { buttonClasses } from "@/components/ui/button";
import { getApplication, listApplicationEvents, listApplicationNotes, listApplicationRequirements, listVacancyStages } from "@/modules/applications/repository";
import { addNoteAction, moveApplicationAction, requirementCheckAction, trackingAction } from "@/modules/applications/actions";
import { MoveForm, NoteForm, RequirementCheckForm, TrackingForm } from "@/modules/applications/application-forms";
import { listScales } from "@/modules/catalogs/repository";
import { daysInStage } from "@/modules/applications/filters";
import { DISCARD_REASON, REQUIREMENT_CHECK, REQUIREMENT_TYPE, STAGE_CATEGORY } from "@/modules/labels";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { param, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Postulación" };

const DATE = new Intl.DateTimeFormat("es-CR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Costa_Rica" });
const EVENT: Record<string, string> = {
  creada: "Postulación creada",
  cambio_etapa: "Cambio de etapa",
  calificacion: "Calificación",
  requisito: "Requisito evaluado",
  nota: "Observación",
  proximo_paso: "Próximo paso",
};

export default async function PostulacionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const [user, a] = await Promise.all([requireSessionUser(), getApplication(id)]);
  if (!a) notFound();
  const operational = can(user.role, "postulaciones:editar");
  const [stages, events, notes, reqs, scales] = await Promise.all([
    listVacancyStages(a.vacancy_id),
    operational ? listApplicationEvents(id) : Promise.resolve({ data: [], error: null }),
    operational ? listApplicationNotes(id) : Promise.resolve({ data: [], error: null }),
    operational ? listApplicationRequirements(id, a.vacancy_id) : Promise.resolve({ data: [], error: null }),
    operational ? listScales() : Promise.resolve({ data: [], error: null }),
  ]);
  const name = `${a.candidate?.first_name ?? ""} ${a.candidate?.last_name ?? ""}`.trim();
  const levelsBy = new Map(scales.data.map((s) => [s.id, s.levels]));
  const mandatory = reqs.data.filter((r) => r.requirement_type === "obligatorio");
  const met = mandatory.filter((r) => r.check?.status === "cumple").length;

  return (
    <>
      <PageHeader
        title={name}
        description={`${a.vacancy?.code ?? ""} · ${a.vacancy?.title ?? ""} · ${a.vacancy?.requisition?.client?.name ?? ""}`}
        actions={
          <>
            <Link href={`/candidatos/${a.candidate_id}`} className={buttonClasses("secondary")}>
              Ficha del candidato
            </Link>
            <Link href={`/vacantes/${a.vacancy_id}/postulaciones`} className={buttonClasses("secondary")}>
              <KanbanSquare className="h-4 w-4" aria-hidden /> Tablero
            </Link>
          </>
        }
      />
      <Flash code={param(sp, "ok")} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Estado" action={a.vstage ? <Badge def={STAGE_CATEGORY[a.vstage.category]} /> : null} />
          <dl className="grid gap-5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase text-neutral-500">Etapa actual</dt>
              <dd className="mt-1 font-semibold" data-testid="etapa-actual">{a.vstage?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-neutral-500">En la etapa</dt>
              <dd className="mt-1">
                {daysInStage(a.stage_changed_at)} día(s){a.vstage?.target_days != null ? ` (objetivo ${a.vstage.target_days})` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-neutral-500">Postulación</dt>
              <dd className="mt-1">{formatDate(a.applied_at)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-neutral-500">Responsable</dt>
              <dd className="mt-1">{a.recruiter?.full_name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-neutral-500">Calificación</dt>
              <dd className="mt-1">{a.rating ? `${"★".repeat(a.rating)} (${a.rating}/5)` : "Sin calificar"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-neutral-500">Próximo paso</dt>
              <dd className="mt-1">{a.next_action ? `${a.next_action}${a.next_action_at ? ` · ${formatDate(a.next_action_at)}` : ""}` : "—"}</dd>
            </div>
            {a.hired_at ? (
              <div>
                <dt className="text-xs font-medium uppercase text-neutral-500">Contratación</dt>
                <dd className="mt-1 font-semibold text-emerald-700">{formatDate(a.hired_at)}</dd>
              </div>
            ) : null}
            {a.discard_reason ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase text-neutral-500">Motivo del descarte</dt>
                <dd className="mt-1">
                  {DISCARD_REASON[a.discard_reason]}
                  {a.discard_note ? ` — ${a.discard_note}` : ""}
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>
        {operational ? (
          <Card>
            <CardHeader title="Acciones" />
            <div className="space-y-6 px-5 py-5">
              <MoveForm action={moveApplicationAction} applicationId={id} vacancyId={a.vacancy_id} stages={stages.data} currentStageId={a.stage_id ?? null} />
              <TrackingForm action={trackingAction} applicationId={id} rating={a.rating} nextAction={a.next_action ?? null} nextActionAt={a.next_action_at ?? null} />
            </div>
          </Card>
        ) : (
          <Card className="px-5 py-5 text-sm text-neutral-600">Vista de solo lectura para su rol. Las observaciones y evaluaciones son confidenciales.</Card>
        )}
      </div>

      {operational ? (
        <>
          <Card className="mt-6">
            <CardHeader
              title="Seguimiento de requisitos"
              description={mandatory.length ? `Obligatorios cumplidos: ${met} de ${mandatory.length}` : "Requisitos de la vacante (se configuran en la ficha de la vacante)."}
            />
            {reqs.error ? <p className="px-5 py-4 text-sm text-brand-700">{reqs.error}</p> : null}
            {reqs.data.length === 0 ? (
              <p className="px-5 py-6 text-sm text-neutral-500">La vacante no tiene requisitos configurados.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {reqs.data.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {r.requirement} {r.expected_level ? <span className="text-xs font-normal text-neutral-500">· mínimo {r.expected_level}</span> : null}
                      </p>
                      <div className="mt-1 flex gap-2">
                        <Badge def={REQUIREMENT_TYPE[r.requirement_type]} />
                        <Badge def={REQUIREMENT_CHECK[r.check?.status ?? "pendiente"]} />
                        {r.check?.level?.label ? <span className="text-xs text-neutral-600">Alcanzado: {r.check.level.label}</span> : null}
                      </div>
                    </div>
                    <RequirementCheckForm
                      action={requirementCheckAction}
                      applicationId={id}
                      requirementId={r.id}
                      label={r.requirement}
                      status={r.check?.status ?? "pendiente"}
                      levelId={r.check?.level_id ?? null}
                      note={r.check?.note ?? null}
                      levels={r.scale_id ? (levelsBy.get(r.scale_id) ?? []) : []}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Observaciones" />
              <div className="space-y-4 px-5 py-5">
                {notes.data.length === 0 ? <p className="text-sm text-neutral-500">Sin observaciones.</p> : null}
                <ul className="space-y-3" aria-label="Observaciones">
                  {notes.data.map((n) => (
                    <li key={n.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                      <p className="whitespace-pre-line">{n.body}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {n.author?.full_name ?? "—"} · {DATE.format(new Date(n.created_at))} · {n.visibility === "confidencial" ? "Confidencial" : "Equipo"}
                      </p>
                    </li>
                  ))}
                </ul>
                <NoteForm action={addNoteAction} applicationId={id} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Historial de movimientos" description="Registro inalterable." />
              {events.data.length === 0 ? (
                <p className="px-5 py-6 text-sm text-neutral-500">Sin movimientos.</p>
              ) : (
                <ol className="divide-y divide-neutral-100" aria-label="Historial de movimientos">
                  {events.data.map((e) => (
                    <li key={e.id} className="px-5 py-3 text-sm">
                      <p className="font-semibold">
                        {EVENT[e.event_type] ?? e.event_type}
                        {e.event_type === "cambio_etapa" ? `: ${e.from_stage?.name ?? "—"} → ${e.to_stage?.name ?? "—"}` : ""}
                        {e.event_type === "creada" && e.to_stage ? ` en ${e.to_stage.name}` : ""}
                      </p>
                      {e.detail ? <p className="text-neutral-700">{e.detail}</p> : null}
                      <p className="text-xs text-neutral-500">
                        {DATE.format(new Date(e.created_at))} · {e.actor?.full_name ?? "Sistema"}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </>
      ) : null}
      {a.vacancy?.status && !["abierta", "pausada"].includes(a.vacancy.status) ? (
        <Alert className="mt-6">La vacante está {a.vacancy.status}: no admite nuevas contrataciones.</Alert>
      ) : null}
    </>
  );
}
