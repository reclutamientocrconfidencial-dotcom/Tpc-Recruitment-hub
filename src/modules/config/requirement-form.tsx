"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, SelectInput, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { REQUIREMENT_CATEGORY, REQUIREMENT_TYPE, optionsFrom } from "@/modules/labels";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function RequirementForm({ action, clientId }: { action: Action; clientId: string | null }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  const err = state.fieldErrors ?? {};
  const v = (k: string, d = "") => (state.ok ? d : (state.values?.[k] ?? d));
  return (
    <form ref={formRef} action={formAction} noValidate className="rounded-lg border border-dashed border-neutral-300 p-4">
      <input type="hidden" name="client_id" value={clientId ?? ""} />
      {state.error ? <Alert tone="error" className="mb-3">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert className="mb-3">{state.message}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Field id="requirement" label="Requisito" required error={err.requirement} className="lg:col-span-2">
          <TextInput id="requirement" defaultValue={v("requirement")} maxLength={300} error={err.requirement} />
        </Field>
        <Field id="position_title" label="Posición (opcional)" error={err.position_title}>
          <TextInput id="position_title" defaultValue={v("position_title")} maxLength={120} placeholder="Todas" error={err.position_title} />
        </Field>
        <Field id="requirement_type" label="Tipo" error={err.requirement_type}>
          <SelectInput id="requirement_type" defaultValue={v("requirement_type", "obligatorio")} options={optionsFrom(REQUIREMENT_TYPE)} />
        </Field>
        <Field id="category" label="Categoría" error={err.category}>
          <SelectInput id="category" defaultValue={v("category", "experiencia")} options={optionsFrom(REQUIREMENT_CATEGORY)} />
        </Field>
        <Field id="weight" label="Peso (1–5)" error={err.weight}>
          <SelectInput id="weight" defaultValue={v("weight", "3")} options={["1", "2", "3", "4", "5"].map((n) => ({ value: n, label: n }))} />
        </Field>
        <Field id="expected_level" label="Nivel esperado" error={err.expected_level} className="lg:col-span-2">
          <TextInput id="expected_level" defaultValue={v("expected_level")} maxLength={120} placeholder="Ej.: B2, 2 años" error={err.expected_level} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <SubmitButton variant="dark">Agregar requisito</SubmitButton>
      </div>
    </form>
  );
}
