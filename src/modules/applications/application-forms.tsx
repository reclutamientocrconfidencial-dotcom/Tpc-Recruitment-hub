"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { DISCARD_REASON, REQUIREMENT_CHECK, optionsFrom } from "@/modules/labels";
import type { ProficiencyLevel, VacancyStage } from "@/types/database";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;
const CONTROL = "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm";

function Messages({ state }: { state: ActionState }) {
  return (
    <>
      {state.error ? <Alert tone="error" className="mb-2">{state.error}</Alert> : null}
      {state.ok && state.message ? <p className="mb-2 text-sm text-emerald-700" role="status">{state.message}</p> : null}
    </>
  );
}

export function MoveForm({ action, applicationId, vacancyId, stages, currentStageId }: { action: Action; applicationId: string; vacancyId: string; stages: VacancyStage[]; currentStageId: string | null }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const [stageId, setStageId] = useState("");
  const target = stages.find((s) => s.id === stageId);
  return (
    <form action={formAction} aria-label="Cambiar de etapa" className="space-y-2">
      <Messages state={state} />
      <input type="hidden" name="application_id" value={applicationId} />
      <input type="hidden" name="vacancy_id" value={vacancyId} />
      <label htmlFor="stage_id" className="block text-sm font-medium">
        Mover a la etapa
      </label>
      <select id="stage_id" name="stage_id" value={stageId} onChange={(e) => setStageId(e.target.value)} className={CONTROL}>
        <option value="">Seleccione…</option>
        {stages
          .filter((s) => s.id !== currentStageId)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.position}. {s.name}
            </option>
          ))}
      </select>
      {target?.category === "descartado" ? (
        <>
          <label htmlFor="move-discard-reason" className="block text-sm font-medium">
            Motivo del descarte (obligatorio)
          </label>
          <select id="move-discard-reason" name="discard_reason" defaultValue="" className={CONTROL}>
            <option value="">Seleccione…</option>
            {optionsFrom(DISCARD_REASON).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label htmlFor="move-discard-note" className="block text-sm font-medium">
            Detalle
          </label>
          <input id="move-discard-note" name="discard_note" maxLength={500} className={CONTROL} />
        </>
      ) : null}
      {target?.category === "contratado" ? <p className="text-xs text-neutral-600">Al contratar se ocupa una plaza de la vacante.</p> : null}
      <SubmitButton pendingText="Moviendo…">Mover</SubmitButton>
    </form>
  );
}

export function TrackingForm({ action, applicationId, rating, nextAction, nextActionAt }: { action: Action; applicationId: string; rating: number | null; nextAction: string | null; nextActionAt: string | null }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} aria-label="Seguimiento" className="space-y-2">
      <Messages state={state} />
      <input type="hidden" name="application_id" value={applicationId} />
      <label htmlFor="rating" className="block text-sm font-medium">
        Calificación general
      </label>
      <select id="rating" name="rating" defaultValue={rating ? String(rating) : ""} className={CONTROL}>
        <option value="">Sin calificar</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {"★".repeat(n)} ({n})
          </option>
        ))}
      </select>
      <label htmlFor="next_action" className="block text-sm font-medium">
        Próximo paso
      </label>
      <input id="next_action" name="next_action" defaultValue={nextAction ?? ""} maxLength={200} placeholder="Ej.: coordinar entrevista con el cliente" className={CONTROL} />
      <label htmlFor="next_action_at" className="block text-sm font-medium">
        Fecha del próximo paso
      </label>
      <input id="next_action_at" name="next_action_at" type="date" defaultValue={nextActionAt ?? ""} className={CONTROL} />
      <SubmitButton variant="dark">Guardar seguimiento</SubmitButton>
    </form>
  );
}

export function NoteForm({ action, applicationId }: { action: Action; applicationId: string }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} aria-label="Nueva observación" className="space-y-2">
      <Messages state={state} />
      <input type="hidden" name="application_id" value={applicationId} />
      <label htmlFor="note-body" className="block text-sm font-medium">
        Observación
      </label>
      <textarea id="note-body" name="body" rows={3} maxLength={2000} className={CONTROL} />
      <label htmlFor="note-visibility" className="block text-sm font-medium">
        Visibilidad
      </label>
      <select id="note-visibility" name="visibility" defaultValue="equipo" className={CONTROL}>
        <option value="equipo">Equipo (personal operativo con acceso a la postulación)</option>
        <option value="confidencial">Confidencial (solo usted, coordinación y administración)</option>
      </select>
      <SubmitButton variant="dark">Agregar observación</SubmitButton>
    </form>
  );
}

export function RequirementCheckForm({
  action,
  applicationId,
  requirementId,
  label,
  status,
  levelId,
  note,
  levels,
}: {
  action: Action;
  applicationId: string;
  requirementId: string;
  label: string;
  status: string;
  levelId: string | null;
  note: string | null;
  levels: ProficiencyLevel[];
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} aria-label={`Evaluar ${label}`} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="application_id" value={applicationId} />
      <input type="hidden" name="requirement_id" value={requirementId} />
      <select name="status" defaultValue={status} aria-label={`Resultado de ${label}`} className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm">
        {optionsFrom(REQUIREMENT_CHECK).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {levels.length > 0 ? (
        <select name="level_id" defaultValue={levelId ?? ""} aria-label={`Nivel alcanzado en ${label}`} className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm">
          <option value="">Nivel…</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      ) : null}
      <input name="note" defaultValue={note ?? ""} maxLength={300} aria-label={`Nota sobre ${label}`} placeholder="Nota" className="w-40 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      <SubmitButton variant="secondary" pendingText="…">
        Guardar
      </SubmitButton>
      {state.error ? <span className="text-xs text-brand-700" role="alert">{state.error}</span> : null}
      {state.ok ? <span className="text-xs text-emerald-700" role="status">✓</span> : null}
    </form>
  );
}

/** Postular al candidato desde su ficha. */
export function ApplyForm({ action, candidateId, vacancies }: { action: Action; candidateId: string; vacancies: Array<{ id: string; code: string; title: string }> }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  if (vacancies.length === 0) return <p className="text-sm text-neutral-500">No hay vacantes abiertas disponibles para este candidato.</p>;
  return (
    <form action={formAction} aria-label="Postular a una vacante" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="candidate_id" value={candidateId} />
      <input type="hidden" name="go_to" value="postulacion" />
      <div className="min-w-64 flex-1">
        <label htmlFor="apply-vacancy" className="block text-sm font-medium">
          Vacante abierta
        </label>
        <select id="apply-vacancy" name="vacancy_id" defaultValue="" className={CONTROL}>
          <option value="">Seleccione…</option>
          {vacancies.map((v) => (
            <option key={v.id} value={v.id}>
              {v.code} · {v.title}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton pendingText="Postulando…">Postular</SubmitButton>
      {state.error ? <p className="w-full text-sm text-brand-700" role="alert">{state.error}</p> : null}
    </form>
  );
}
