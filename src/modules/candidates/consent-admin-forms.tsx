"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, TextArea, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function ConsentTextForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const err = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm" aria-label="Nueva versión del consentimiento">
      <h2 className="text-base font-semibold">Nueva versión</h2>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok ? <Alert>{state.message}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="ct-version" label="Versión" required error={err.version}>
          <TextInput id="ct-version" name="version" maxLength={30} placeholder="Ej.: 2027-1" error={err.version} />
        </Field>
        <Field id="ct-title" label="Título" required error={err.title} className="sm:col-span-2">
          <TextInput id="ct-title" name="title" maxLength={150} error={err.title} />
        </Field>
      </div>
      <Field id="ct-body" label="Texto completo" required error={err.body} hint="Copie el texto aprobado por el asesor legal.">
        <TextArea id="ct-body" name="body" rows={8} maxLength={20000} error={err.body} />
      </Field>
      <SubmitButton variant="dark">Crear versión</SubmitButton>
    </form>
  );
}

export function ApproveConsentForm({ action, id }: { action: Action; id: string }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div>
        <label htmlFor={`note-${id}`} className="block text-xs font-medium text-neutral-600">
          Aprobación jurídica (quién y cuándo)
        </label>
        <input id={`note-${id}`} name="legal_note" maxLength={500} className="mt-1 w-72 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      </div>
      <SubmitButton variant="secondary" pendingText="Guardando…">
        Registrar aprobación
      </SubmitButton>
      {state.error ? <p className="w-full text-xs text-brand-700" role="alert">{state.error}</p> : null}
      {state.ok ? <p className="w-full text-xs text-emerald-700" role="status">{state.message}</p> : null}
    </form>
  );
}
