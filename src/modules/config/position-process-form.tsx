"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, SelectInput } from "@/components/ui/form";
import { SearchSelect } from "@/components/ui/search-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import type { JobPosition } from "@/types/database";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Crea el proceso de un puesto duplicando un proceso existente. */
export function PositionProcessForm({
  action,
  clientId,
  positions,
  sources,
  excludePositionIds,
}: {
  action: Action;
  clientId: string | null;
  positions: JobPosition[];
  sources: Array<{ id: string; label: string }>;
  excludePositionIds: string[];
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (state.ok) setFormKey((k) => k + 1);
  }, [state]);
  const excluded = new Set(excludePositionIds);
  return (
    <form action={formAction} noValidate className="rounded-lg border border-dashed border-neutral-300 p-4" aria-label="Agregar proceso para un puesto">
      <input type="hidden" name="client_id" value={clientId ?? ""} />
      {state.error ? <Alert tone="error" className="mb-3">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert className="mb-3">{state.message}</Alert> : null}
      <div key={formKey} className="grid gap-3 sm:grid-cols-2">
        <Field id="pp-position" label="Puesto" required>
          <SearchSelect
            id="pp-position"
            name="position_id"
            label="Puesto del proceso"
            placeholder="Buscar o escribir un puesto…"
            allowCreate
            createLabel="Nuevo puesto"
            options={positions.filter((p) => p.is_active && !excluded.has(p.id)).map((p) => ({ value: p.id, label: p.name, hint: p.area }))}
          />
        </Field>
        <Field id="pp-source" label="Copiar etapas de">
          <SelectInput id="pp-source" name="source_template_id" options={sources.map((s) => ({ value: s.id, label: s.label }))} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <SubmitButton variant="dark">Crear proceso del puesto</SubmitButton>
      </div>
    </form>
  );
}
