"use client";

import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { STAGE_CATEGORY, STAGE_TYPE, optionsFrom } from "@/modules/labels";
import type { PipelineStage, StageCategory, StageType } from "@/types/database";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface Row {
  key: number;
  name: string;
  category: StageCategory;
  stage_type: StageType;
  target_days: string;
}

const CONTROL =
  "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:bg-neutral-100";

/**
 * Editor de etapas: agregar, quitar, reordenar y renombrar. Se guarda todo junto
 * (la base de datos reemplaza las etapas en una sola transacción).
 */
export function PipelineEditor({
  action,
  stages,
  templateId,
  clientId,
  canEdit,
}: {
  action: Action;
  stages: PipelineStage[];
  templateId: string | null;
  clientId: string | null;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const [rows, setRows] = useState<Row[]>(() =>
    stages.map((s, i) => ({
      key: i,
      name: s.name,
      category: s.category,
      stage_type: s.stage_type,
      target_days: s.target_days == null ? "" : String(s.target_days),
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
    setRows((r) => [...r, { key: nextKey, name: "", category: "en_proceso", stage_type: "general", target_days: "" }]);
    setNextKey((k) => k + 1);
  };

  const payload = JSON.stringify(rows.map(({ name, category, stage_type, target_days }) => ({ name, category, stage_type, target_days })));

  return (
    <form action={formAction}>
      <input type="hidden" name="stages" value={payload} />
      <input type="hidden" name="template_id" value={templateId ?? ""} />
      <input type="hidden" name="client_id" value={clientId ?? ""} />
      {state.error ? <Alert tone="error" className="mb-3">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert className="mb-3">{state.message}</Alert> : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <caption className="sr-only">Etapas del proceso</caption>
          <thead className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <tr>
              <th scope="col" className="w-10 px-2 py-2">#</th>
              <th scope="col" className="px-2 py-2">Etapa</th>
              <th scope="col" className="px-2 py-2">Categoría</th>
              <th scope="col" className="px-2 py-2">Tipo</th>
              <th scope="col" className="w-24 px-2 py-2">Plazo (días)</th>
              {canEdit ? <th scope="col" className="w-28 px-2 py-2"><span className="sr-only">Acciones</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row, i) => (
              <tr key={row.key}>
                <td className="px-2 py-2 font-mono text-xs text-neutral-500">{i + 1}</td>
                <td className="px-2 py-2">
                  <input
                    aria-label={`Nombre de la etapa ${i + 1}`}
                    className={CONTROL}
                    value={row.name}
                    maxLength={60}
                    disabled={!canEdit}
                    onChange={(e) => update(row.key, { name: e.target.value })}
                  />
                </td>
                <td className="px-2 py-2">
                  <select
                    aria-label={`Categoría de la etapa ${i + 1}`}
                    className={CONTROL}
                    value={row.category}
                    disabled={!canEdit}
                    onChange={(e) => update(row.key, { category: e.target.value as StageCategory })}
                  >
                    {optionsFrom(STAGE_CATEGORY).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select
                    aria-label={`Tipo de la etapa ${i + 1}`}
                    className={CONTROL}
                    value={row.stage_type}
                    disabled={!canEdit}
                    onChange={(e) => update(row.key, { stage_type: e.target.value as StageType })}
                  >
                    {optionsFrom(STAGE_TYPE).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label={`Plazo en días de la etapa ${i + 1}`}
                    className={CONTROL}
                    inputMode="numeric"
                    value={row.target_days}
                    disabled={!canEdit}
                    onChange={(e) => update(row.key, { target_days: e.target.value.replace(/\D/g, "").slice(0, 3) })}
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
            ))}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <Button variant="secondary" onClick={add} disabled={rows.length >= 50}>
            <Plus className="h-4 w-4" aria-hidden /> Agregar etapa
          </Button>
          <SubmitButton>Guardar proceso</SubmitButton>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-neutral-500">
        La <strong>categoría</strong> agrupa las etapas para métricas e informes. Todo proceso necesita al menos una etapa
        «Nuevo», una «Contratado» y una «Descartado».
      </p>
    </form>
  );
}
