"use client";

import { startTransition, useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { ASSESSMENT_REQUIREMENT, ASSESSMENT_STATUS, INTERVIEW_KIND, INTERVIEW_STATUS, QUESTION_CATEGORY, RECOMMENDATION, optionsFrom } from "@/modules/labels";
import type {
  AssessmentResult,
  AssessmentType,
  CredentialType,
  ExecutiveReport,
  Interview,
  ProficiencyLevel,
  ProficiencyScale,
  ReportSection,
  ReportTemplate,
} from "@/types/database";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type Opt = { value: string; label: string };

function Messages({ state }: { state: ActionState }) {
  return (
    <>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok && state.message ? <p className="text-sm text-emerald-700" role="status">{state.message}</p> : null}
    </>
  );
}

/** Envío sin reinicio automático (React 19): lo escrito se conserva si hay errores. */
function useKeep(action: Action) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) fd.set(submitter.name, submitter.value);
    startTransition(() => formAction(fd));
  };
  return { state, onSubmit, pending, e: state.fieldErrors ?? {} };
}

// ---------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------
export function QuestionBankForm({ action, positions, clients }: { action: Action; positions: Opt[]; clients: Opt[] }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} aria-label="Nueva pregunta del banco" className="space-y-3">
      <Messages state={state} />
      <Field id="qb-text" label="Pregunta" required error={e.text}>
        <TextArea id="qb-text" name="text" rows={2} maxLength={500} error={e.text} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="qb-category" label="Categoría">
          <SelectInput id="qb-category" name="category" defaultValue="competencia" options={optionsFrom(QUESTION_CATEGORY)} />
        </Field>
        <Field id="qb-position" label="Puesto" hint="Vacío: todos los puestos.">
          <SelectInput id="qb-position" name="position_id" defaultValue="" placeholder="Todos" options={positions} />
        </Field>
        <Field id="qb-client" label="Cliente" hint="Vacío: todos los clientes.">
          <SelectInput id="qb-client" name="client_id" defaultValue="" placeholder="Todos" options={clients} />
        </Field>
      </div>
      <Field id="qb-guidance" label="Qué observar (opcional)" error={e.guidance}>
        <TextInput id="qb-guidance" name="guidance" maxLength={1000} error={e.guidance} />
      </Field>
      <SubmitButton variant="secondary">Agregar pregunta</SubmitButton>
    </form>
  );
}

export function AssessmentTypeForm({ action, scales }: { action: Action; scales: ProficiencyScale[] }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} aria-label="Nuevo tipo de evaluación" className="space-y-3">
      <Messages state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="at-name" label="Nombre" required error={e.name}>
          <TextInput id="at-name" name="name" maxLength={100} error={e.name} />
        </Field>
        <Field id="at-scale" label="Resultado con nivel (opcional)">
          <SelectInput id="at-scale" name="scale_id" defaultValue="" placeholder="Sin escala" options={scales.filter((s) => s.is_active).map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
        <Field id="at-max" label="Puntaje máximo (opcional)" error={e.max_score}>
          <TextInput id="at-max" name="max_score" inputMode="decimal" error={e.max_score} />
        </Field>
        <Field id="at-pass" label="Puntaje mínimo para aprobar (opcional)" error={e.pass_score}>
          <TextInput id="at-pass" name="pass_score" inputMode="decimal" error={e.pass_score} />
        </Field>
      </div>
      <Field id="at-desc" label="Descripción (opcional)">
        <TextInput id="at-desc" name="description" maxLength={500} />
      </Field>
      <SubmitButton variant="secondary">Agregar tipo de evaluación</SubmitButton>
    </form>
  );
}

export function CredentialTypeForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} aria-label="Nuevo tipo de credencial" className="flex flex-wrap items-end gap-3">
      <div className="w-full">
        <Messages state={state} />
      </div>
      <Field id="ct-name" label="Nombre" required error={e.name} className="min-w-56 flex-1">
        <TextInput id="ct-name" name="name" maxLength={100} error={e.name} />
      </Field>
      <Field id="ct-alert" label="Avisar con (días)" error={e.alert_days}>
        <TextInput id="ct-alert" name="alert_days" type="number" min={0} max={365} defaultValue="30" className="w-28" error={e.alert_days} />
      </Field>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="requires_expiry" defaultChecked className="h-4 w-4 accent-brand-600" /> Tiene vencimiento
      </label>
      <SubmitButton variant="secondary">Agregar</SubmitButton>
    </form>
  );
}

export function TemplateForm({ action, current }: { action: Action; current: ReportTemplate | null }) {
  const { state, onSubmit, pending, e } = useKeep(action);
  return (
    <form onSubmit={onSubmit} aria-label="Nueva versión de la plantilla" className="space-y-3">
      <Messages state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="tp-name" label="Nombre" required error={e.name} className="sm:col-span-2">
          <TextInput id="tp-name" name="name" defaultValue={current?.name ?? ""} maxLength={150} error={e.name} />
        </Field>
        <Field id="tp-version" label="Versión" required error={e.version}>
          <TextInput id="tp-version" name="version" placeholder="Ej.: 2027-1-OFICIAL" maxLength={30} error={e.version} />
        </Field>
      </div>
      <Field id="tp-header" label="Encabezado">
        <TextInput id="tp-header" name="header_text" defaultValue={current?.header_text ?? ""} maxLength={500} />
      </Field>
      <Field id="tp-sections" label="Secciones (una por línea: «Título | ayuda para quien redacta»)" required error={e.sections}>
        <TextArea id="tp-sections" name="sections" rows={8} defaultValue={(current?.sections ?? []).map((s) => `${s.title}${s.help ? ` | ${s.help}` : ""}`).join("\n")} error={e.sections} />
      </Field>
      <Field id="tp-footer" label="Pie de página (confidencialidad)">
        <TextArea id="tp-footer" name="footer_text" rows={2} defaultValue={current?.footer_text ?? ""} maxLength={500} />
      </Field>
      <p className="text-xs text-neutral-500">
        Las secciones cuyo título menciona «evaluaciones» o «entrevista» se prellenan con los resultados y resúmenes registrados.
      </p>
      <SubmitButton pending={pending} variant="dark">
        Publicar nueva versión
      </SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------------
// Vacante
// ---------------------------------------------------------------------
export function VacancyAssessmentForm({ action, vacancyId, types, scales }: { action: Action; vacancyId: string; types: AssessmentType[]; scales: ProficiencyScale[] }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const [typeId, setTypeId] = useState("");
  const type = types.find((t) => t.id === typeId);
  const levels = type?.scale_id ? (scales.find((s) => s.id === type.scale_id)?.levels ?? []).filter((l) => l.is_active) : [];
  return (
    <form action={formAction} aria-label="Agregar evaluación a la vacante" className="space-y-2">
      <Messages state={state} />
      <input type="hidden" name="vacancy_id" value={vacancyId} />
      <div className="flex flex-wrap items-end gap-2">
        <Field id="va-type" label="Evaluación" className="min-w-48 flex-1">
          <select id="va-type" name="assessment_type_id" value={typeId} onChange={(ev) => setTypeId(ev.target.value)} className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm">
            <option value="">Seleccione…</option>
            {types.filter((t) => t.is_active).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="va-req" label="Exigencia">
          <SelectInput id="va-req" name="requirement" defaultValue="obligatoria" options={optionsFrom(ASSESSMENT_REQUIREMENT)} />
        </Field>
        {levels.length ? (
          <Field id="va-level" label="Nivel mínimo">
            <SelectInput id="va-level" name="min_level_id" defaultValue="" placeholder="Sin mínimo" options={levels.map((l) => ({ value: l.id, label: l.label }))} />
          </Field>
        ) : null}
        <SubmitButton variant="secondary">Guardar</SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Postulación: entrevistas, resultados e informe
// ---------------------------------------------------------------------
export function ScheduleInterviewForm({ action, applicationId, users, defaultInterviewer }: { action: Action; applicationId: string; users: Opt[]; defaultInterviewer: string }) {
  const { state, onSubmit, pending, e } = useKeep(action);
  return (
    <form onSubmit={onSubmit} aria-label="Programar entrevista" className="space-y-3">
      <Messages state={state} />
      <input type="hidden" name="application_id" value={applicationId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="iv-when" label="Fecha y hora (Costa Rica)" required error={e.scheduled_at}>
          <TextInput id="iv-when" name="scheduled_at" type="datetime-local" error={e.scheduled_at} />
        </Field>
        <Field id="iv-kind" label="Modalidad">
          <SelectInput id="iv-kind" name="kind" defaultValue="virtual" options={optionsFrom(INTERVIEW_KIND)} />
        </Field>
        <Field id="iv-duration" label="Duración (minutos)" error={e.duration_min}>
          <TextInput id="iv-duration" name="duration_min" type="number" min={10} max={480} defaultValue="45" error={e.duration_min} />
        </Field>
        <Field id="iv-interviewer" label="Entrevistador(a)">
          <SelectInput id="iv-interviewer" name="interviewer_id" defaultValue={defaultInterviewer} options={users} />
        </Field>
      </div>
      <Field id="iv-location" label="Lugar o enlace de la reunión" error={e.location}>
        <TextInput id="iv-location" name="location" maxLength={300} error={e.location} />
      </Field>
      <SubmitButton pending={pending} pendingText="Programando…">
        Programar entrevista
      </SubmitButton>
    </form>
  );
}

export function InterviewResultForm({ action, interview }: { action: Action; interview: Interview }) {
  const { state, onSubmit, pending } = useKeep(action);
  return (
    <form onSubmit={onSubmit} aria-label="Resultado de la entrevista" className="space-y-5">
      <Messages state={state} />
      <input type="hidden" name="id" value={interview.id} />
      <ol className="space-y-4" aria-label="Guion de la entrevista">
        {(interview.answers ?? []).map((a) => (
          <li key={a.position} className="rounded-lg border border-neutral-200 p-3">
            <p className="text-sm font-semibold">
              {a.position}. {a.question_text}
            </p>
            {a.guidance ? <p className="text-xs text-neutral-500">Observar: {a.guidance}</p> : null}
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
              <textarea name={`notes_${a.position}`} defaultValue={a.notes ?? ""} rows={2} maxLength={2000} aria-label={`Notas de la pregunta ${a.position}`} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
              <select name={`rating_${a.position}`} defaultValue={a.rating ? String(a.rating) : ""} aria-label={`Calificación de la pregunta ${a.position}`} className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm">
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
            </div>
          </li>
        ))}
      </ol>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="ir-status" label="Estado">
          <SelectInput id="ir-status" name="status" defaultValue={interview.status} options={optionsFrom(INTERVIEW_STATUS)} />
        </Field>
        <Field id="ir-rating" label="Calificación general">
          <SelectInput id="ir-rating" name="rating" defaultValue={interview.rating ? String(interview.rating) : ""} placeholder="Sin calificar" options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} / 5` }))} />
        </Field>
        <Field id="ir-rec" label="Recomendación">
          <SelectInput id="ir-rec" name="recommendation" defaultValue={interview.recommendation ?? ""} placeholder="Seleccione…" options={optionsFrom(RECOMMENDATION)} />
        </Field>
      </div>
      <Field id="ir-summary" label="Resumen de la entrevista">
        <TextArea id="ir-summary" name="summary" rows={4} maxLength={4000} defaultValue={interview.summary ?? ""} />
      </Field>
      <SubmitButton pending={pending} variant="dark">
        Guardar entrevista
      </SubmitButton>
    </form>
  );
}

export function AssessmentResultForm({ action, applicationId, type, result, levels }: { action: Action; applicationId: string; type: AssessmentType; result: AssessmentResult | null; levels: ProficiencyLevel[] }) {
  const { state, onSubmit, pending } = useKeep(action);
  return (
    <form onSubmit={onSubmit} aria-label={`Resultado de ${type.name}`} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="application_id" value={applicationId} />
      <input type="hidden" name="assessment_type_id" value={type.id} />
      <select name="status" defaultValue={result?.status ?? "pendiente"} aria-label={`Estado de ${type.name}`} className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm">
        {optionsFrom(ASSESSMENT_STATUS).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {type.max_score != null ? (
        <input name="score" defaultValue={result?.score ?? ""} inputMode="decimal" aria-label={`Puntaje de ${type.name}`} placeholder={`Puntaje / ${type.max_score}`} className="w-32 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      ) : null}
      {levels.length ? (
        <select name="level_id" defaultValue={result?.level_id ?? ""} aria-label={`Nivel en ${type.name}`} className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm">
          <option value="">Nivel…</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      ) : null}
      <input name="evaluated_on" type="date" defaultValue={result?.evaluated_on ?? ""} aria-label={`Fecha de ${type.name}`} className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      <input name="notes" defaultValue={result?.notes ?? ""} maxLength={1000} aria-label={`Observaciones de ${type.name}`} placeholder="Observaciones" className="w-44 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      <SubmitButton variant="secondary" pendingText="…" pending={pending}>
        Guardar
      </SubmitButton>
      {state.error ? <span className="w-full text-xs text-brand-700" role="alert">{state.error}</span> : null}
      {state.ok && !pending ? <span className="text-xs text-emerald-700" role="status">✓ Guardado</span> : null}
    </form>
  );
}

export function CredentialForm({ action, candidateId, types }: { action: Action; candidateId: string; types: CredentialType[] }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} aria-label="Registrar credencial" className="space-y-3">
      <Messages state={state} />
      <input type="hidden" name="candidate_id" value={candidateId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="cr-type" label="Tipo" required error={e.credential_type_id}>
          <SelectInput id="cr-type" name="credential_type_id" defaultValue="" placeholder="Seleccione…" options={types.filter((t) => t.is_active).map((t) => ({ value: t.id, label: t.name }))} />
        </Field>
        <Field id="cr-identifier" label="Número (opcional)" error={e.identifier}>
          <TextInput id="cr-identifier" name="identifier" maxLength={60} error={e.identifier} />
        </Field>
        <Field id="cr-issued" label="Emisión" error={e.issued_on}>
          <TextInput id="cr-issued" name="issued_on" type="date" error={e.issued_on} />
        </Field>
        <Field id="cr-expires" label="Vencimiento" error={e.expires_on}>
          <TextInput id="cr-expires" name="expires_on" type="date" error={e.expires_on} />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-56 flex-1">
          <label htmlFor="cr-file" className="block text-sm font-medium">
            Respaldo (PDF, Word, JPG o PNG; máx. 5 MB; opcional)
          </label>
          <input id="cr-file" name="file" type="file" accept=".pdf,.docx,.jpg,.jpeg,.png" className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink-950 file:px-3 file:py-1.5 file:text-white" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="verified" className="h-4 w-4 accent-brand-600" /> Verifiqué el documento original
        </label>
      </div>
      <SubmitButton variant="secondary">Registrar credencial</SubmitButton>
    </form>
  );
}

export function ReportEditor({ action, report, sections, canReopen }: { action: Action; report: ExecutiveReport; sections: ReportSection[]; canReopen: boolean }) {
  const { state, onSubmit, pending } = useKeep(action);
  const final = report.status === "final";
  return (
    <form
      onSubmit={(ev) => {
        const submitter = (ev.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.value === "finalizar" && !window.confirm("¿Finalizar el informe? Después solo coordinación o administración podrán reabrirlo.")) {
          ev.preventDefault();
          return;
        }
        onSubmit(ev);
      }}
      aria-label="Informe ejecutivo"
      className="space-y-5"
    >
      <Messages state={state} />
      <input type="hidden" name="id" value={report.id} />
      <input type="hidden" name="application_id" value={report.application_id} />
      {sections.map((s) => (
        <Field key={s.key} id={`s_${s.key}`} label={s.title} hint={s.help}>
          <TextArea id={`s_${s.key}`} name={`s_${s.key}`} rows={5} maxLength={8000} defaultValue={report.content[s.key] ?? ""} readOnly={final} hint={s.help} />
        </Field>
      ))}
      <Field id="rp-rec" label="Recomendación final" required={!final}>
        <SelectInput id="rp-rec" name="recommendation" defaultValue={report.recommendation ?? ""} placeholder="Seleccione…" options={optionsFrom(RECOMMENDATION)} disabled={final} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {!final ? (
          <>
            <SubmitButton pending={pending} variant="secondary">
              Guardar borrador
            </SubmitButton>
            <button type="submit" name="intent" value="finalizar" disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              Finalizar informe
            </button>
          </>
        ) : canReopen ? (
          <button type="submit" name="intent" value="reabrir" disabled={pending} className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-60">
            Reabrir (versión nueva)
          </button>
        ) : null}
      </div>
      {/* Intención por omisión al guardar el borrador */}
      <input type="hidden" name="intent" value="guardar" />
    </form>
  );
}
