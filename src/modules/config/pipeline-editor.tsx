"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PipelineSaveState } from "@/modules/config/actions";
import { STAGE_CATEGORY, STAGE_TYPE } from "@/modules/labels";
import { STAGE_CATEGORIES, type PipelineStage, type StageCatalogItem } from "@/types/database";

type Action = (prev: PipelineSaveState, formData: FormData) => Promise<PipelineSaveState>;
const INITIAL: PipelineSaveState = {};

interface Row {
  key: number;
  catalogId: string;
  targetDays: string;
  /** Etapa guardada que no está enlazada al catálogo (formato 0800): se conserva tal cual. */
  legacy: Pick<PipelineStage, "name" | "category" | "stage_type"> | null;
}

const CONTROL =
  "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:bg-neutral-100";

/**
 * Editor de etapas basado en el catálogo: cada fila se elige de una lista
 * desplegable y la categoría y el tipo se asignan automáticamente (la base de
 * datos los vuelve a asignar desde el catálogo al guardar).
 */
export function PipelineEditor({
  action,
  stages,
  catalog,
  templateId,
  clientId,
  vacancyId = null,
  canEdit,
  label = "proceso",
}: {
  action: Action;
  stages: PipelineStage[];
  catalog: StageCatalogItem[];
  templateId: string | null;
  clientId: string | null;
  vacancyId?: string | null;
  canEdit: boolean;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const byName = useMemo(() => new Map(catalog.map((c) => [c.name.toLowerCase(), c])), [catalog]);

  const toRows = (list: PipelineStage[]): Row[] =>
    list.map((s, i) => {
      const catalogId = s.catalog_stage_id ?? byName.get(s.name.toLowerCase())?.id ?? "";
      return {
        key: i,
        catalogId,
        targetDays: s.target_days == null ? "" : String(s.target_days),
        legacy: catalogId ? null : { name: s.name, category: s.category, stage_type: s.stage_type },
      };
    });
  const [rows, setRows] = useState<Row[]>(() => toRows(stages));
  // Proceso que se está editando: el que confirmó el servidor tiene prioridad.
  const currentTemplateId = state.templateId ?? templateId;

  // Tras guardar, la pantalla muestra exactamente lo almacenado (no lo que se escribió).
  useEffect(() => {
    if (state.savedStages && state.savedAt) {
      setRows(toRows(state.savedStages));
      setNextKey(state.savedStages.length + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al recibir un nuevo resultado
  }, [state.savedAt]);

  const [nextKey, setNextKey] = useState(stages.length + 1);

  const update = (key: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const move = (index: number, delta: number) =>
    setRows((r) => {
      const target = index + delta;
      if (target < 0 || target >= r.length) return r;
      const copy = [...r];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item!);
      return copy;
    });
  const add = () => {
    setRows((r) => [...r, { key: nextKey, catalogId: "", targetDays: "", legacy: null }]);
    setNextKey((k) => k + 1);
  };

  const used = new Set(rows.map((r) => r.catalogId).filter(Boolean));
  const categories = new Set(rows.map((r) => byId.get(r.catalogId)?.category ?? r.legacy?.category).filter(Boolean));
  const missing = (["nuevo", "contratado", "descartado"] as const).filter((c) => !categories.has(c));
  const unlinked = rows.filter((r) => r.catalogId && !byId.has(r.catalogId)).length;
  const catalogUnavailable = catalog.length === 0 || unlinked > 0;
  const editable = canEdit && !catalogUnavailable;
  const payload = JSON.stringify(
    rows.map((r) =>
      r.catalogId
        ? { catalog_stage_id: r.catalogId, target_days: r.targetDays }
        : r.legacy
          ? { ...r.legacy, target_days: r.targetDays }
          : { catalog_stage_id: "", target_days: r.targetDays },
    ),
  );

  /**
   * Se envía con onSubmit + startTransition (no con `<form action>`): React 19
   * reinicia automáticamente los formularios con `action`, y ese reinicio nativo
   * devolvía las listas desplegables controladas a su opción inicial, mostrando
   * etapas distintas de las guardadas.
   */
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editable || pending) return;
    const formData = new FormData(e.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={onSubmit} aria-label={`Etapas del ${label}`} aria-busy={pending}>
      <input type="hidden" name="stages" value={payload} />
      <input type="hidden" name="template_id" value={currentTemplateId ?? ""} />
      <input type="hidden" name="client_id" value={clientId ?? ""} />
      <input type="hidden" name="vacancy_id" value={vacancyId ?? ""} />
      {state.error ? <Alert tone="error" className="mb-3">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert className="mb-3">{state.message}</Alert> : null}
      {canEdit && catalogUnavailable ? (
        <Alert tone="error" className="mb-3" title="Catálogo de etapas no disponible">
          No se pudo cargar el catálogo de etapas o alguna etapa ya no está en él. Para no guardar un proceso
          incompleto, la edición está deshabilitada. Verifique que la migración 0810 esté aplicada y recargue la página.
        </Alert>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <caption className="sr-only">Etapas del {label}</caption>
          <thead className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <tr>
              <th scope="col" className="w-10 px-2 py-2">#</th>
              <th scope="col" className="min-w-56 px-2 py-2">Etapa (catálogo)</th>
              <th scope="col" className="px-2 py-2">Categoría</th>
              <th scope="col" className="px-2 py-2">Tipo</th>
              <th scope="col" className="w-24 px-2 py-2">Plazo (días)</th>
              {canEdit ? <th scope="col" className="w-28 px-2 py-2"><span className="sr-only">Acciones</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row, i) => {
              const item = byId.get(row.catalogId);
              return (
                <tr key={row.key}>
                  <td className="px-2 py-2 font-mono text-xs text-neutral-500">{i + 1}</td>
                  <td className="px-2 py-2">
                    <select
                      aria-label={`Etapa ${i + 1}`}
                      className={CONTROL}
                      value={row.catalogId}
                      disabled={!editable}
                      onChange={(e) => {
                        const next = byId.get(e.target.value);
                        update(row.key, {
                          catalogId: e.target.value,
                          targetDays: next?.default_target_days == null ? "" : String(next.default_target_days),
                        });
                      }}
                    >
                      <option value="">{row.legacy ? `${row.legacy.name} (sin catálogo)` : "Seleccione una etapa…"}</option>
                      {STAGE_CATEGORIES.map((cat) => (
                        <optgroup key={cat} label={STAGE_CATEGORY[cat].label}>
                          {catalog
                            .filter((c) => c.category === cat && (c.is_active || c.id === row.catalogId))
                            .map((c) => (
                              <option key={c.id} value={c.id} disabled={used.has(c.id) && c.id !== row.catalogId}>
                                {c.name}
                                {c.is_active ? "" : " (inactiva)"}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2" data-testid={`categoria-${i + 1}`}>
                    {item ? (
                      <Badge def={STAGE_CATEGORY[item.category]} />
                    ) : row.legacy ? (
                      <Badge def={STAGE_CATEGORY[row.legacy.category]} />
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-neutral-700" data-testid={`tipo-${i + 1}`}>
                    {item ? STAGE_TYPE[item.stage_type] : row.legacy ? STAGE_TYPE[row.legacy.stage_type] : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`Plazo en días de la etapa ${i + 1}`}
                      className={CONTROL}
                      inputMode="numeric"
                      value={row.targetDays}
                      disabled={!editable}
                      onChange={(e) => update(row.key, { targetDays: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                    />
                  </td>
                  {canEdit ? (
                    <td className="px-2 py-2">
                      <fieldset disabled={!editable} className="contents">
                      <div className="flex gap-1">
                        <button type="button" className="rounded p-1.5 hover:bg-neutral-100 disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir etapa ${i + 1}`}>
                          <ArrowUp className="h-4 w-4" aria-hidden />
                        </button>
                        <button type="button" className="rounded p-1.5 hover:bg-neutral-100 disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Bajar etapa ${i + 1}`}>
                          <ArrowDown className="h-4 w-4" aria-hidden />
                        </button>
                        <button type="button" className="rounded p-1.5 text-brand-700 hover:bg-brand-50" onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))} aria-label={`Quitar etapa ${i + 1}`}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                      </fieldset>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && missing.length > 0 ? (
        <p className="mt-3 text-xs text-brand-700" role="status">
          Falta al menos una etapa de categoría: {missing.map((c) => STAGE_CATEGORY[c].label).join(", ")}.
        </p>
      ) : null}

      {canEdit ? (
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <Button variant="secondary" onClick={add} disabled={!editable || rows.length >= 50}>
            <Plus className="h-4 w-4" aria-hidden /> Agregar etapa
          </Button>
          <Button type="submit" disabled={!editable || pending} aria-busy={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {pending ? "Guardando…" : `Guardar ${label}`}
          </Button>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-neutral-500">
        Elija las etapas del catálogo: la <strong>categoría</strong> y el <strong>tipo</strong> se asignan automáticamente. Todo
        proceso necesita al menos una etapa «Nuevo», una «Contratado» y una «Descartado».
      </p>
    </form>
  );
}
