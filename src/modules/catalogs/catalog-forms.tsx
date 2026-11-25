"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { REQUIREMENT_CATEGORY, optionsFrom } from "@/modules/labels";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function useResettingForm(action: Action) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return { state, formAction, ref, err: state.fieldErrors ?? {} };
}

function Messages({ state }: { state: ActionState }) {
  return (
    <>
      {state.error ? <Alert tone="error" className="mb-3">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert className="mb-3">{state.message}</Alert> : null}
    </>
  );
}

export function PositionForm({ action }: { action: Action }) {
  const { state, formAction, ref, err } = useResettingForm(action);
  return (
    <form ref={ref} action={formAction} noValidate aria-label="Nuevo puesto" className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">Agregar puesto</h2>
      <Messages state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="pos-name" label="Nombre del puesto" required error={err.name}>
          <TextInput id="pos-name" name="name" maxLength={150} error={err.name} placeholder="Ej.: Supervisor(a) de bodega" />
        </Field>
        <Field id="pos-area" label="Área" error={err.area}>
          <TextInput id="pos-area" name="area" maxLength={100} error={err.area} placeholder="Ej.: Operaciones" />
        </Field>
        <Field id="pos-description" label="Descripción" error={err.description}>
          <TextInput id="pos-description" name="description" maxLength={500} error={err.description} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <SubmitButton variant="dark">Agregar puesto</SubmitButton>
      </div>
    </form>
  );
}

export function RequirementCatalogForm({ action, scales }: { action: Action; scales: Array<{ id: string; name: string }> }) {
  const { state, formAction, ref, err } = useResettingForm(action);
  return (
    <form ref={ref} action={formAction} noValidate aria-label="Nuevo requisito del catálogo" className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">Agregar requisito</h2>
      <Messages state={state} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Field id="rc-name" label="Requisito" required error={err.name} className="sm:col-span-2">
          <TextInput id="rc-name" name="name" maxLength={200} error={err.name} placeholder="Ej.: Power BI" />
        </Field>
        <Field id="rc-category" label="Categoría" error={err.category}>
          <SelectInput id="rc-category" name="category" defaultValue="habilidad" options={optionsFrom(REQUIREMENT_CATEGORY)} />
        </Field>
        <Field id="rc-scale" label="Escala de dominio" error={err.scale_id}>
          <SelectInput id="rc-scale" name="scale_id" placeholder="Sin escala" options={scales.map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <SubmitButton variant="dark">Agregar requisito</SubmitButton>
      </div>
    </form>
  );
}

export function ScaleForm({ action }: { action: Action }) {
  const { state, formAction, ref, err } = useResettingForm(action);
  return (
    <form ref={ref} action={formAction} noValidate aria-label="Nueva escala" className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">Crear escala de dominio</h2>
      <Messages state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="sc-name" label="Nombre de la escala" required error={err.name}>
          <TextInput id="sc-name" name="name" maxLength={80} error={err.name} placeholder="Ej.: Nivel de SAP" />
        </Field>
        <Field id="sc-description" label="Descripción" error={err.description}>
          <TextInput id="sc-description" name="description" maxLength={300} error={err.description} />
        </Field>
        <Field id="sc-levels" label="Niveles (uno por línea, del más bajo al más alto)" required error={err.levels} className="sm:col-span-2">
          <TextArea id="sc-levels" name="levels" rows={4} error={err.levels} placeholder={"Usuario\nUsuario clave\nConsultor"} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <SubmitButton variant="dark">Crear escala</SubmitButton>
      </div>
    </form>
  );
}

export function AddLevelForm({ action, scaleId, scaleName }: { action: Action; scaleId: string; scaleName: string }) {
  const { state, formAction, ref } = useResettingForm(action);
  return (
    <form ref={ref} action={formAction} noValidate className="flex flex-wrap items-center gap-2" aria-label={`Agregar nivel a ${scaleName}`}>
      <input type="hidden" name="scale_id" value={scaleId} />
      <input
        name="label"
        maxLength={60}
        aria-label={`Nuevo nivel para ${scaleName}`}
        placeholder="Nuevo nivel"
        className="w-40 rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
      />
      <SubmitButton variant="secondary" pendingText="…">Agregar nivel</SubmitButton>
      {state.error ? <span role="alert" className="text-xs text-brand-700">{state.error}</span> : null}
      {state.ok ? <span role="status" className="text-xs text-emerald-700">{state.message}</span> : null}
    </form>
  );
}
