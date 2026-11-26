import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { PipelineEditor } from "@/modules/config/pipeline-editor";
import { RequirementForm } from "@/modules/config/requirement-form";
import { ResetPipelineButton } from "@/modules/config/reset-pipeline-button";
import { StageQuickForm } from "@/modules/config/stage-quick-form";
import { PositionProcessForm } from "@/modules/config/position-process-form";
import {
  addRequirementAction,
  duplicatePipelineAction,
  resetClientPipelineAction,
  savePipelineAction,
  toggleRequirementAction,
} from "@/modules/config/actions";
import { createStageCatalogAction } from "@/modules/catalogs/actions";
import { REQUIREMENT_CATEGORY, REQUIREMENT_TYPE } from "@/modules/labels";
import type {
  JobPosition,
  PipelineTemplate,
  ProficiencyScale,
  RequirementCatalogItem,
  RequirementTemplate,
  StageCatalogItem,
} from "@/types/database";

/** Panel de etapas del proceso general (cliente o estándar global). */
export function PipelinePanel({
  clientId,
  own,
  fallback,
  catalog,
  canEdit,
}: {
  clientId: string | null;
  own: PipelineTemplate | null;
  fallback: PipelineTemplate | null;
  catalog: StageCatalogItem[];
  canEdit: boolean;
}) {
  const template = own ?? fallback;
  const usingGlobal = clientId !== null && !own;
  return (
    <Card className="mb-6">
      <CardHeader
        title="Etapas del proceso"
        description={
          clientId
            ? usingGlobal
              ? "Este cliente usa el proceso estándar TPC. Modifíquelo para crear un proceso propio."
              : "Proceso propio de este cliente."
            : "Proceso estándar TPC: se aplica a los clientes sin proceso propio."
        }
        action={clientId && own && canEdit ? <ResetPipelineButton action={resetClientPipelineAction} clientId={clientId} templateId={own.id} label="Usar proceso estándar" /> : null}
      />
      <div className="px-5 py-4">
        {template ? (
          <PipelineEditor
            action={savePipelineAction}
            stages={template.stages}
            catalog={catalog}
            templateId={own?.id ?? (clientId ? null : template.id)}
            clientId={clientId}
            canEdit={canEdit}
          />
        ) : (
          <Alert tone="error">No se encontró el proceso estándar. Verifique las migraciones 0800 y 0810.</Alert>
        )}
        {canEdit ? (
          <details className="mt-5 rounded-lg border border-neutral-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink-950">¿No encuentra la etapa? Agréguela al catálogo</summary>
            <div className="mt-3">
              <StageQuickForm action={createStageCatalogAction} />
            </div>
          </details>
        ) : null}
      </div>
    </Card>
  );
}

/** Procesos específicos por puesto (prioridad sobre el proceso general). */
export function PositionProcessesPanel({
  clientId,
  pipelines,
  baseTemplates,
  catalog,
  positions,
  canEdit,
}: {
  clientId: string | null;
  pipelines: PipelineTemplate[];
  baseTemplates: Array<{ id: string; label: string }>;
  catalog: StageCatalogItem[];
  positions: JobPosition[];
  canEdit: boolean;
}) {
  return (
    <Card className="mb-6">
      <CardHeader
        title="Procesos por puesto"
        description={
          clientId
            ? "Tienen prioridad sobre el proceso del cliente cuando la vacante es de ese puesto."
            : "Procesos estándar por puesto para todos los clientes sin configuración propia."
        }
      />
      <div className="space-y-3 px-5 py-4">
        {pipelines.length === 0 ? <p className="text-sm text-neutral-500">No hay procesos específicos por puesto.</p> : null}
        {pipelines.map((p) => (
          <details key={p.id} className="rounded-lg border border-neutral-200">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
              <span className="font-semibold text-ink-950">{p.position?.name ?? "Puesto"}</span>
              <span className="text-xs text-neutral-500">{p.stages.length} etapas</span>
            </summary>
            <div className="border-t border-neutral-100 px-4 py-4">
              <PipelineEditor
                action={savePipelineAction}
                stages={p.stages}
                catalog={catalog}
                templateId={p.id}
                clientId={clientId}
                canEdit={canEdit}
                label={`proceso de ${p.position?.name ?? "puesto"}`}
              />
              {canEdit && clientId !== undefined ? (
                <div className="mt-3 flex justify-end">
                  <ResetPipelineButton
                    action={resetClientPipelineAction}
                    clientId={clientId}
                    templateId={p.id}
                    label="Eliminar proceso del puesto"
                    confirmText="¿Eliminar el proceso de este puesto? Se usará el proceso heredado."
                  />
                </div>
              ) : null}
            </div>
          </details>
        ))}
        {canEdit ? (
          <PositionProcessForm
            action={duplicatePipelineAction}
            clientId={clientId}
            positions={positions}
            sources={baseTemplates}
            excludePositionIds={pipelines.map((p) => p.position_id ?? "").filter(Boolean)}
          />
        ) : null}
      </div>
    </Card>
  );
}

/** Panel de requisitos reutilizables (cliente o globales). */
export function RequirementsPanel({
  clientId,
  vacancyId = null,
  title = "Requisitos predeterminados",
  description = "Se ofrecerán al crear vacantes para este alcance. Base para la futura comparación automática con CV.",
  action,
  rows,
  error,
  canEdit,
  catalog,
  positions,
  scales,
}: {
  clientId: string | null;
  vacancyId?: string | null;
  title?: string;
  description?: string;
  /** Acción adicional en el encabezado (p. ej. cargar requisitos sugeridos). */
  action?: React.ReactNode;
  rows: RequirementTemplate[];
  error: string | null;
  canEdit: boolean;
  catalog: RequirementCatalogItem[];
  positions: JobPosition[];
  scales: ProficiencyScale[];
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} action={action} />
      <div className="space-y-4 px-5 py-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {rows.length === 0 && !error ? <p className="text-sm text-neutral-500">Aún no hay requisitos registrados.</p> : null}
        {rows.length > 0 ? (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {rows.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${r.is_active ? "" : "opacity-60"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-950">
                    {r.requirement}
                    {r.expected_level ? <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-700">Nivel mínimo: {r.expected_level}</span> : null}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {r.position_title ?? "Todos los puestos"} · {REQUIREMENT_CATEGORY[r.category]} · Peso {r.weight}
                    {r.is_active ? "" : " · Inactivo"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge def={REQUIREMENT_TYPE[r.requirement_type]} />
                  {canEdit ? (
                    <form action={toggleRequirementAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="client_id" value={clientId ?? ""} />
                      <input type="hidden" name="vacancy_id" value={vacancyId ?? ""} />
                      <input type="hidden" name="is_active" value={r.is_active ? "false" : "true"} />
                      <button type="submit" className="text-xs font-semibold text-brand-600 hover:underline" aria-label={`${r.is_active ? "Desactivar" : "Activar"} requisito ${r.requirement}`}>
                        {r.is_active ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {canEdit ? <RequirementForm action={addRequirementAction} clientId={clientId} vacancyId={vacancyId} requirements={catalog} positions={positions} scales={scales} /> : null}
      </div>
    </Card>
  );
}
