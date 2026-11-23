import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { PipelineEditor } from "@/modules/config/pipeline-editor";
import { RequirementForm } from "@/modules/config/requirement-form";
import { ResetPipelineButton } from "@/modules/config/reset-pipeline-button";
import { addRequirementAction, resetClientPipelineAction, savePipelineAction, toggleRequirementAction } from "@/modules/config/actions";
import { REQUIREMENT_CATEGORY, REQUIREMENT_TYPE } from "@/modules/labels";
import type { PipelineTemplate, RequirementTemplate } from "@/types/database";

/** Panel de etapas del proceso (cliente o global). */
export function PipelinePanel({
  clientId,
  own,
  fallback,
  canEdit,
}: {
  clientId: string | null;
  own: PipelineTemplate | null;
  fallback: PipelineTemplate | null;
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
        action={
          clientId && own && canEdit ? <ResetPipelineButton action={resetClientPipelineAction} clientId={clientId} templateId={own.id} /> : null
        }
      />
      <div className="px-5 py-4">
        {template ? (
          <PipelineEditor
            action={savePipelineAction}
            stages={template.stages}
            templateId={own?.id ?? (clientId ? null : template.id)}
            clientId={clientId}
            canEdit={canEdit}
          />
        ) : (
          <Alert tone="error">No se encontró el proceso estándar. Verifique la migración 0800.</Alert>
        )}
      </div>
    </Card>
  );
}

/** Panel de requisitos reutilizables (cliente o globales). */
export function RequirementsPanel({
  clientId,
  rows,
  error,
  canEdit,
}: {
  clientId: string | null;
  rows: RequirementTemplate[];
  error: string | null;
  canEdit: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="Requisitos predeterminados"
        description="Se ofrecerán al crear vacantes para este cliente y posición. Base para la futura comparación automática con CV."
      />
      <div className="space-y-4 px-5 py-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {rows.length === 0 && !error ? <p className="text-sm text-neutral-500">Aún no hay requisitos registrados.</p> : null}
        {rows.length > 0 ? (
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {rows.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${r.is_active ? "" : "opacity-60"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-950">{r.requirement}</p>
                  <p className="text-xs text-neutral-500">
                    {r.position_title ?? "Todas las posiciones"} · {REQUIREMENT_CATEGORY[r.category]}
                    {r.expected_level ? ` · ${r.expected_level}` : ""} · Peso {r.weight}
                    {r.is_active ? "" : " · Inactivo"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge def={REQUIREMENT_TYPE[r.requirement_type]} />
                  {canEdit ? (
                    <form action={toggleRequirementAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="client_id" value={clientId ?? ""} />
                      <input type="hidden" name="is_active" value={r.is_active ? "false" : "true"} />
                      <button type="submit" className="text-xs font-semibold text-brand-600 hover:underline">
                        {r.is_active ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {canEdit ? <RequirementForm action={addRequirementAction} clientId={clientId} /> : null}
      </div>
    </Card>
  );
}
