"use client";

import { useActionState, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { STAGE_CATEGORY, STAGE_TYPE } from "@/modules/labels";
import { STAGE_CATEGORIES, type PipelineStage, type StageCatalogItem } from "@/types/database";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface Row {
  key: number;
  catalogId: string;
  targetDays: string;
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
  canEdit,
  label = "proceso",
}: {
  action: Action;
  stages: PipelineStage[];
  catalog: StageCatalogItem[];
  templateId: string | null;
  clientId: string | null;
  canEdit: boolean;
  label?: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const byName = useMemo(() => new Map(catalog.map((c) => [c.name.toLowerCase(), c])), [catalog]);

  const [rows, setRows] = useState<Row[]>(() =>
    stages.map((s, i) => ({
      key: i,
      catalogId: s.catalog_stage_id ?? byName.get(s.name.toLowerCase())?.id ?? "",
      targetDays: s.target_days == null ? "" : String(s.target_days),
    })),
  );
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
    setRows((r) => [...r, { key: nextKey, catalogId: "", targetDays: "" }]);
    setNextKey((k) => k + 1);
  };

  const used = new Set(rows.map((r) => r.catalogId).filter(Boolean));
  const categories = new Set(rows.map((r) => byId.get(r.catalogId)?.category).filter(Boolean));
  const missing = (["nuevo", "contratado", "descartado"] as const).filter((c) => !categories.has(c));
  const payload = JSON.stringify(rows.map((r) => ({ catalog_stage_id: r.catalogId, target_days: r.targetDays })));

  return (
    <form action={formAction} aria-label={`Etapas del ${label}`}>
      <input type="hidden" name="stages" value={payload} />
      <input type="hidden" name="template_id" value={templateId ?? ""} />
      <input type="hidden" name="client_id" value={clientId ?? ""} />
      {state.error ? <Alert tone="error" className="mb-3">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert className="mb-3">{state.message}</Alert> : null}

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
                      disabled={!canEdit}
                      onChange={(e) => {
                        const next = byId.get(e.target.value);
                        update(row.key, {
                          catalogId: e.target.value,
                          targetDays: next?.default_target_days == null ? "" : String(next.default_target_days),
                        });
                      }}
                    >
                      <option value="">Seleccione una etapa…</option>
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
                    {item ? <Badge def={STAGE_CATEGORY[item.category]} /> : <span className="text-neutral-400">—</span>}
                  </td>
                  <td className="px-2 py-2 text-neutral-700" data-testid={`tipo-${i + 1}`}>
                    {item ? STAGE_TYPE[item.stage_type] : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`Plazo en días de la etapa ${i + 1}`}
                      className={CONTROL}
                      inputMode="numeric"
                      value={row.targetDays}
                      disabled={!canEdit}
                      onChange={(e) => update(row.key, { targetDays: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                    />
                  </td>
                  {canEdit ? (
                    <td className="px-2 py-2">
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
          <Button variant="secondary" onClick={add} disabled={rows.length >= 50}>
            <Plus className="h-4 w-4" aria-hidden /> Agregar etapa
          </Button>
          <SubmitButton>Guardar {label}</SubmitButton>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-neutral-500">
        Elija las etapas del catálogo: la <strong>categoría</strong> y el <strong>tipo</strong> se asignan automáticamente. Todo
        proceso necesita al menos una etapa «Nuevo», una «Contratado» y una «Descartado».
      </p>
    </form>
  );
}
