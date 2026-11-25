"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, SelectInput, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { STAGE_CATEGORY, STAGE_TYPE, optionsFrom } from "@/modules/labels";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Crea una etapa nueva en el catálogo; aparece de inmediato en las listas. */
export function StageQuickForm({ action, idPrefix = "nueva-etapa" }: { action: Action; idPrefix?: string }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const err = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={formAction} noValidate aria-label="Nueva etapa del catálogo">
      {state.error ? <Alert tone="error" className="mb-3">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert className="mb-3">{state.message}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field id={`${idPrefix}-name`} label="Nombre de la etapa" required error={err.name} className="lg:col-span-2">
          <TextInput id={`${idPrefix}-name`} name="name" maxLength={60} error={err.name} placeholder="Ej.: Evaluación psicométrica" defaultValue={state.ok ? "" : state.values?.name} key={state.values?.name ?? "n"} />
        </Field>
        <Field id={`${idPrefix}-category`} label="Categoría" error={err.category}>
          <SelectInput id={`${idPrefix}-category`} name="category" defaultValue="en_proceso" options={optionsFrom(STAGE_CATEGORY)} />
        </Field>
        <Field id={`${idPrefix}-type`} label="Tipo" error={err.stage_type}>
          <SelectInput id={`${idPrefix}-type`} name="stage_type" defaultValue="general" options={optionsFrom(STAGE_TYPE)} />
        </Field>
        <Field id={`${idPrefix}-days`} label="Plazo sugerido (días)" error={err.default_target_days}>
          <TextInput id={`${idPrefix}-days`} name="default_target_days" inputMode="numeric" maxLength={3} error={err.default_target_days} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <SubmitButton variant="dark">Agregar al catálogo</SubmitButton>
      </div>
    </form>
  );
}
