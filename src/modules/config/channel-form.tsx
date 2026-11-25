"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, SelectInput, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { INTAKE_CATEGORY, optionsFrom } from "@/modules/labels";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function ChannelForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const err = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={formAction} noValidate className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">Agregar fuente</h2>
      {state.error ? <Alert tone="error" className="mb-3">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert className="mb-3">{state.message}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="name" label="Nombre" required error={err.name}>
          <TextInput id="name" maxLength={80} placeholder="Ej.: Plataforma ficticia" error={err.name} defaultValue={state.ok ? "" : state.values?.name} />
        </Field>
        <Field id="category" label="Categoría" required error={err.category}>
          <SelectInput id="category" options={optionsFrom(INTAKE_CATEGORY)} defaultValue={state.values?.category ?? "plataforma_empleo"} />
        </Field>
        <Field id="detail_label" label="Dato adicional a solicitar" error={err.detail_label} hint="Opcional. Ej.: Nombre de la feria">
          <TextInput id="detail_label" maxLength={80} error={err.detail_label} defaultValue={state.ok ? "" : state.values?.detail_label} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <SubmitButton variant="dark">Agregar</SubmitButton>
      </div>
    </form>
  );
}
