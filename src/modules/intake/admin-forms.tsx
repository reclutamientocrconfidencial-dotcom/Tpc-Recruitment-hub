"use client";

import { startTransition, useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { QUESTION_KIND, optionsFrom } from "@/modules/labels";
import type { PublicFormRow, QuestionKind } from "@/types/database";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function Messages({ state }: { state: ActionState }) {
  return (
    <>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok && state.message ? <p className="text-sm text-emerald-700" role="status">{state.message}</p> : null}
    </>
  );
}

/** Envío sin reinicio automático (React 19) para conservar lo escrito ante errores. */
function useKeepForm(action: Action) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };
  return { state, onSubmit, pending };
}

export function NewFormForm({ action, vacancies }: { action: Action; vacancies: Array<{ id: string; code: string; title: string }> }) {
  const { state, onSubmit, pending } = useKeepForm(action);
  const e = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} aria-label="Nuevo formulario" className="space-y-3">
      <Messages state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="vacancy_id" label="Vacante" hint="Vacía: formulario permanente del banco de talento." error={e.vacancy_id}>
          <SelectInput id="vacancy_id" defaultValue="" placeholder="Banco de talento (sin vacante)" options={vacancies.map((v) => ({ value: v.id, label: `${v.code} · ${v.title}` }))} />
        </Field>
        <Field id="title" label="Título visible para el público" required error={e.title}>
          <TextInput id="title" maxLength={150} placeholder="Ej.: Postúlese como ejecutivo(a) de ventas" error={e.title} />
        </Field>
      </div>
      <Field id="intro" label="Presentación (opcional)" error={e.intro}>
        <TextArea id="intro" rows={3} maxLength={2000} error={e.intro} />
      </Field>
      <div className="flex flex-wrap items-end gap-4">
        <Field id="closes_at" label="Recibe envíos hasta (opcional)" error={e.closes_at}>
          <TextInput id="closes_at" type="date" error={e.closes_at} />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="require_cv" defaultChecked className="h-4 w-4 accent-brand-600" /> Currículum obligatorio
        </label>
      </div>
      <SubmitButton pending={pending} pendingText="Creando…">
        Crear formulario
      </SubmitButton>
    </form>
  );
}

export function EditFormForm({ action, form }: { action: Action; form: PublicFormRow }) {
  const { state, onSubmit, pending } = useKeepForm(action);
  const e = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} aria-label="Editar formulario" className="space-y-3">
      <Messages state={state} />
      <input type="hidden" name="id" value={form.id} />
      <Field id="title" label="Título visible para el público" required error={e.title}>
        <TextInput id="title" defaultValue={form.title} maxLength={150} error={e.title} />
      </Field>
      <Field id="intro" label="Presentación" error={e.intro}>
        <TextArea id="intro" defaultValue={form.intro ?? ""} rows={3} maxLength={2000} error={e.intro} />
      </Field>
      <div className="flex flex-wrap items-end gap-4">
        <Field id="closes_at" label="Recibe envíos hasta" error={e.closes_at}>
          <TextInput id="closes_at" type="date" defaultValue={form.closes_at ?? ""} error={e.closes_at} />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="require_cv" defaultChecked={form.require_cv} className="h-4 w-4 accent-brand-600" /> Currículum obligatorio
        </label>
      </div>
      <SubmitButton pending={pending} variant="dark">
        Guardar
      </SubmitButton>
    </form>
  );
}

export function QuestionForm({ action, formId }: { action: Action; formId: string }) {
  // Envío estándar: al agregar, el formulario se limpia para la siguiente pregunta.
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const [kind, setKind] = useState<QuestionKind>("si_no");
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} aria-label="Nueva pregunta" className="space-y-3">
      <Messages state={state} />
      <input type="hidden" name="form_id" value={formId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="q-label" label="Pregunta" required error={e.label} className="sm:col-span-2">
          <TextInput id="q-label" name="label" maxLength={300} placeholder="Ej.: ¿Cuenta con licencia B1 vigente?" error={e.label} />
        </Field>
        <Field id="q-kind" label="Tipo de respuesta">
          <select id="q-kind" name="kind" value={kind} onChange={(ev) => setKind(ev.target.value as QuestionKind)} className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm">
            {optionsFrom(QUESTION_KIND).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {kind === "opcion" ? (
        <Field id="q-options" label="Opciones (una por línea)" required error={e.options}>
          <TextArea id="q-options" name="options" rows={3} error={e.options} />
        </Field>
      ) : null}
      <div className="flex flex-wrap items-end gap-4">
        {kind === "si_no" ? (
          <Field id="q-expected" label="Criterio eliminatorio" error={e.expected_answer}>
            <SelectInput id="q-expected" name="expected_answer" defaultValue="" placeholder="Ninguno (informativa)" options={[{ value: "si", label: "Debe responder Sí" }, { value: "no", label: "Debe responder No" }]} />
          </Field>
        ) : null}
        {kind === "opcion" ? (
          <Field id="q-expected" label="Opción que cumple (opcional)" error={e.expected_answer}>
            <TextInput id="q-expected" name="expected_answer" maxLength={100} placeholder="Texto exacto de la opción" error={e.expected_answer} />
          </Field>
        ) : null}
        {kind === "numero" ? (
          <Field id="q-min" label="Mínimo que cumple (opcional)" error={e.min_number}>
            <TextInput id="q-min" name="min_number" inputMode="decimal" maxLength={9} error={e.min_number} />
          </Field>
        ) : null}
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="required" defaultChecked className="h-4 w-4 accent-brand-600" /> Obligatoria
        </label>
      </div>
      <p className="text-xs text-neutral-500">
        El criterio eliminatorio no rechaza al candidato: marca si cumple o no para que el equipo lo priorice. Nunca se muestra al público.
      </p>
      <SubmitButton pending={pending} variant="secondary" pendingText="Agregando…">
        Agregar pregunta
      </SubmitButton>
    </form>
  );
}

export function LinkForm({ action, formId, channels }: { action: Action; formId: string; channels: Array<{ id: string; name: string }> }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} aria-label="Nuevo enlace" className="space-y-3">
      <Messages state={state} />
      <input type="hidden" name="form_id" value={formId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="l-channel" label="Canal de recepción" required>
          <SelectInput id="l-channel" name="intake_channel_id" defaultValue="" placeholder="Seleccione…" options={channels.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
        <Field id="l-label" label="Detalle (opcional)" hint="Ej.: Feria de empleo Heredia, volante sucursal Cartago.">
          <TextInput id="l-label" name="label" maxLength={100} />
        </Field>
      </div>
      <SubmitButton variant="secondary" pendingText="Creando…">
        Crear enlace y código QR
      </SubmitButton>
    </form>
  );
}

export function ReviewForm({ action, submissionId, matchId }: { action: Action; submissionId: string; matchId: string | null }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const [decision, setDecision] = useState(matchId ? "vincular" : "crear");
  if (state.ok) return <Alert>{state.message}</Alert>;
  return (
    <form
      action={formAction}
      aria-label="Resolver envío"
      className="space-y-3"
      onSubmit={(e) => {
        if (decision === "descartar" && !window.confirm("¿Descartar el envío? Sus datos personales y el currículum se eliminarán.")) e.preventDefault();
      }}
    >
      <Messages state={state} />
      <input type="hidden" name="submission_id" value={submissionId} />
      {matchId ? <input type="hidden" name="candidate_id" value={matchId} /> : null}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Decisión</legend>
        {matchId ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="decision" value="vincular" checked={decision === "vincular"} onChange={() => setDecision("vincular")} className="mt-0.5 h-4 w-4 accent-brand-600" />
            <span>
              <strong>Es la misma persona:</strong> vincular al candidato existente (agrega la postulación, el consentimiento y el currículum; solo completa datos vacíos).
            </span>
          </label>
        ) : null}
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="decision" value="crear" checked={decision === "crear"} onChange={() => setDecision("crear")} className="mt-0.5 h-4 w-4 accent-brand-600" />
          <span>
            <strong>Es otra persona:</strong> crear un candidato nuevo.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="decision" value="descartar" checked={decision === "descartar"} onChange={() => setDecision("descartar")} className="mt-0.5 h-4 w-4 accent-brand-600" />
          <span>
            <strong>Descartar</strong> (envío repetido, de prueba o abusivo). Se eliminan los datos personales.
          </span>
        </label>
      </fieldset>
      <Field id="review-note" label="Nota (opcional)">
        <TextInput id="review-note" name="note" maxLength={300} />
      </Field>
      <SubmitButton pendingText="Procesando…">Confirmar</SubmitButton>
    </form>
  );
}

export function DocumentUploadForm({ action, candidateId }: { action: Action; candidateId: string }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} aria-label="Cargar currículum" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="candidate_id" value={candidateId} />
      <div className="min-w-56 flex-1">
        <label htmlFor="doc-file" className="block text-sm font-medium">
          Cargar currículum (PDF o Word, máx. 5 MB)
        </label>
        <input id="doc-file" name="file" type="file" accept=".pdf,.docx" className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink-950 file:px-3 file:py-1.5 file:text-white" />
      </div>
      <SubmitButton variant="secondary" pendingText="Cargando…">
        Cargar
      </SubmitButton>
      {state.error ? <p className="w-full text-sm text-brand-700" role="alert">{state.error}</p> : null}
      {state.ok ? <p className="w-full text-sm text-emerald-700" role="status">{state.message}</p> : null}
    </form>
  );
}
