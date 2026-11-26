import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { getVacancy, getVacancyConfiguration, listRequisitionVacancies } from "@/modules/vacancies/repository";
import { listRequisitionsForVacancies } from "@/modules/requisitions/repository";
import {
  changeVacancyStatusAction,
  customizeVacancyProcessAction,
  duplicateVacancyAction,
  loadVacancyRequirementsAction,
  updateFilledAction,
} from "@/modules/vacancies/actions";
import { resetClientPipelineAction, savePipelineAction } from "@/modules/config/actions";
import { listJobPositions, listRequirementCatalog, listScales, listStageCatalog } from "@/modules/catalogs/repository";
import { PipelineEditor } from "@/modules/config/pipeline-editor";
import { ResetPipelineButton } from "@/modules/config/reset-pipeline-button";
import { RequirementsPanel } from "@/modules/config/config-panels";
import { StatusActions } from "@/modules/common/status-actions";
import { InlineAction } from "@/modules/common/inline-action";
import { CoverageBar } from "@/modules/common/coverage-bar";
import { FilledForm } from "@/modules/vacancies/filled-form";
import { EMPLOYMENT_TYPE, PRIORITY, REQUISITION_STATUS, VACANCY_STATUS, WORK_MODALITY } from "@/modules/labels";
import { committedOpenings, isOverdue, VACANCY_ACTION_LABEL, VACANCY_TRANSITIONS } from "@/modules/workflow";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { formatDate, formatSalaryRange } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { param, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Vacante" };

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-950">{value || "—"}</dd>
    </div>
  );
}

export default async function VacanteDetallePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const [user, v] = await Promise.all([requireSessionUser(), getVacancy(id)]);
  if (!v) notFound();

  const clientId = v.requisition?.client_id ?? null;
  const canFullEdit = can(user.role, "vacantes:crear");
  const canTrack = can(user.role, "vacantes:editar");
  const canConfigure = can(user.role, "configuracion:gestionar");
  const [config, stageCatalog, reqCatalog, positions, scales, targets, siblings] = await Promise.all([
    getVacancyConfiguration(id, clientId, v.position_id ?? null),
    listStageCatalog(),
    listRequirementCatalog(),
    listJobPositions(),
    listScales(),
    canFullEdit ? listRequisitionsForVacancies() : Promise.resolve({ data: [], error: null }),
    listRequisitionVacancies(v.requisition_id),
  ]);
  // Plazas de la requisición disponibles para publicar (sin contar esta vacante).
  const authorized = v.requisition?.positions_count ?? null;
  const usedByOthers = siblings.data.filter((o) => o.id !== v.id).reduce((n, o) => n + committedOpenings({ ...o, filled_count: o.filled_count ?? 0 }), 0);
  const availableForThis = authorized == null ? null : Math.max(0, authorized - usedByOthers);

  const filled = v.filled_count ?? 0;
  const transitions = canTrack
    ? VACANCY_TRANSITIONS[v.status].map((s) => ({
        status: s,
        label: v.status === "cerrada" && s === "abierta" ? "Reabrir" : (VACANCY_ACTION_LABEL[s] ?? s),
        variant: (s === "abierta" ? "primary" : "secondary") as "primary" | "secondary",
      }))
    : [];
  const active = ["borrador", "abierta", "pausada"].includes(v.status);
  const overdue = active && isOverdue(v.closes_at);
  const process = config.own ?? config.inherited;

  return (
    <>
      <PageHeader
        title={v.title}
        description={`${v.code} · ${v.requisition?.client?.name ?? "Cliente"}`}
        actions={
          canFullEdit ? (
            <Link href={`/vacantes/${id}/editar`} className={buttonClasses("secondary")}>
              <Pencil className="h-4 w-4" aria-hidden /> Editar
            </Link>
          ) : null
        }
      />
      <Flash code={param(sp, "ok")} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Datos de la vacante" action={<Badge def={VACANCY_STATUS[v.status]} />} />
          <dl className="grid gap-5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
            <Item
              label="Requisición"
              value={
                v.requisition ? (
                  <span>
                    <Link className="text-brand-600 hover:underline" href={`/requisiciones/${v.requisition.id}`}>
                      {v.requisition.code}
                    </Link>
                    {v.requisition.status ? <span className="ml-2 text-xs text-neutral-500">({REQUISITION_STATUS[v.requisition.status].label})</span> : null}
                  </span>
                ) : null
              }
            />
            <Item label="Puesto (catálogo)" value={v.position?.name} />
            <Item label="Prioridad" value={v.priority ? <Badge def={PRIORITY[v.priority]} /> : null} />
            <Item label="Provincia" value={v.province} />
            <Item label="Ubicación" value={v.location_detail} />
            <Item label="Modalidad" value={WORK_MODALITY[v.modality]} />
            <Item label="Horario" value={v.work_schedule} />
            <Item label="Contratación" value={EMPLOYMENT_TYPE[v.employment_type]} />
            <Item label="Salario" value={formatSalaryRange(v.salary_min, v.salary_max, v.currency)} />
            <Item label="Responsable" value={v.recruiter?.full_name} />
            <Item label="Publicada" value={formatDate(v.published_at)} />
            <Item label="Fecha límite" value={v.closes_at ? <span className={overdue ? "font-semibold text-brand-700" : ""}>{formatDate(v.closes_at)}{overdue ? " · vencida" : ""}</span> : null} />
            {v.source_vacancy_id ? (
              <Item label="Duplicada de" value={<Link className="text-brand-600 hover:underline" href={`/vacantes/${v.source_vacancy_id}`}>Vacante de origen</Link>} />
            ) : null}
            <div className="sm:col-span-2 lg:col-span-3">
              <Item label="Descripción" value={v.description ? <span className="whitespace-pre-line">{v.description}</span> : null} />
            </div>
          </dl>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Seguimiento de plazas" />
            <div className="space-y-4 px-5 py-5">
              <CoverageBar openings={v.openings} filled={filled} />
              {availableForThis != null && (v.status === "borrador" || v.status === "cerrada") ? (
                <p className={`text-sm ${v.openings > availableForThis ? "font-semibold text-brand-700" : "text-neutral-600"}`} data-testid="plazas-disponibles">
                  Plazas disponibles en la requisición: {availableForThis} de {authorized}.
                  {v.openings > availableForThis ? " Reduzca las plazas de esta vacante o amplíe la requisición para publicarla." : ""}
                </p>
              ) : null}
              {canTrack && v.status !== "cerrada" ? <FilledForm action={updateFilledAction} id={v.id} openings={v.openings} filled={filled} /> : null}
              {transitions.length > 0 ? (
                <div className="border-t border-neutral-100 pt-4">
                  <p className="mb-2 text-sm font-medium text-ink-950">Estado</p>
                  <StatusActions action={changeVacancyStatusAction} id={v.id} options={transitions} confirm={{ cerrada: "¿Cerrar esta vacante?" }} />
                </div>
              ) : null}
              <p className="text-xs text-neutral-500">Al cubrir todas las plazas, la vacante pasa a «Cubierta» automáticamente.</p>
            </div>
          </Card>

          {canFullEdit ? (
            <Card>
              <CardHeader title="Duplicar vacante" description="Copia datos, proceso propio y requisitos en borrador (nunca postulaciones)." />
              <div className="px-5 py-5">
                <InlineAction action={duplicateVacancyAction} fields={{ id: v.id }} label="Duplicar" variant="dark">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="dup-requisition" className="block text-sm font-medium text-ink-950">
                      Requisición de destino
                    </label>
                    <select
                      id="dup-requisition"
                      name="requisition_id"
                      defaultValue=""
                      className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="">La misma requisición</option>
                      {targets.data
                        .filter((t) => t.id !== v.requisition_id)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.code} · {t.title}
                          </option>
                        ))}
                    </select>
                  </div>
                </InlineAction>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="my-6">
        <CardHeader
          title="Etapas del proceso"
          description={config.own ? "Proceso propio de esta vacante (tiene prioridad sobre los heredados)." : `Hereda: ${config.inheritedLabel || "sin proceso"}.`}
          action={
            canConfigure ? (
              config.own ? (
                <ResetPipelineButton
                  action={resetClientPipelineAction}
                  clientId={null}
                  vacancyId={v.id}
                  templateId={config.own.id}
                  label="Usar proceso heredado"
                  confirmText="¿Eliminar el proceso propio de la vacante? Se usará el proceso heredado."
                />
              ) : (
                <InlineAction action={customizeVacancyProcessAction} fields={{ vacancy_id: v.id }} label="Personalizar proceso" variant="dark" />
              )
            ) : null
          }
        />
        <div className="px-5 py-4">
          {process ? (
            <PipelineEditor
              key={process.id}
              action={savePipelineAction}
              stages={process.stages}
              catalog={stageCatalog.data}
              templateId={config.own?.id ?? null}
              clientId={null}
              vacancyId={v.id}
              canEdit={canConfigure && Boolean(config.own)}
              label="proceso de la vacante"
            />
          ) : (
            <Alert tone="error">No se encontró un proceso aplicable. Verifique las migraciones 0800 y 0810.</Alert>
          )}
        </div>
      </Card>

      <RequirementsPanel
        clientId={clientId}
        vacancyId={v.id}
        title="Requisitos de la vacante"
        description="Personalizables por vacante. Puede cargar los sugeridos del cliente, del puesto y globales."
        action={canConfigure ? <InlineAction action={loadVacancyRequirementsAction} fields={{ vacancy_id: v.id }} label="Cargar sugeridos" /> : null}
        rows={config.requirements.data}
        error={config.requirements.error}
        canEdit={canConfigure}
        catalog={reqCatalog.data}
        positions={positions.data}
        scales={scales.data}
      />
    </>
  );
}
