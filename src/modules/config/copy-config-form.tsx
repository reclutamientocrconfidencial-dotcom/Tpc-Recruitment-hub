"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, SelectInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Reutiliza la configuración de otro cliente (no sobrescribe lo existente). */
export function CopyConfigForm({ action, clientId, clients }: { action: Action; clientId: string; clients: Array<{ id: string; name: string }> }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} noValidate aria-label="Copiar configuración de otro cliente">
      <input type="hidden" name="client_id" value={clientId} />
      {state.error ? <Alert tone="error" className="mb-3">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert className="mb-3">{state.message}</Alert> : null}
      <div className="flex flex-wrap items-end gap-4">
        <Field id="copy-source" label="Cliente de origen" className="min-w-64 flex-1">
          <SelectInput id="copy-source" name="source_client_id" placeholder="Seleccione…" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="copy_process" defaultChecked className="h-4 w-4 accent-brand-600" /> Procesos
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="copy_requirements" defaultChecked className="h-4 w-4 accent-brand-600" /> Requisitos
        </label>
        <SubmitButton variant="dark" pendingText="Copiando…">Copiar configuración</SubmitButton>
      </div>
      <p className="mt-2 text-xs text-neutral-500">Lo que ya existe en este cliente no se sobrescribe ni se duplica.</p>
    </form>
  );
}
