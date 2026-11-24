"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Actualiza las plazas cubiertas (la BD impide superar las plazas y marca «cubierta»). */
export function FilledForm({ action, id, openings, filled }: { action: Action; id: string; openings: number; filled: number }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const value = state.values?.filled_count ?? String(filled);
  return (
    <form action={formAction} aria-label="Plazas cubiertas" noValidate>
      <input type="hidden" name="id" value={id} />
      <div className="flex items-end gap-2">
        <div>
          <label htmlFor="filled_count" className="block text-sm font-medium text-ink-950">
            Plazas cubiertas (de {openings})
          </label>
          <input
            id="filled_count"
            name="filled_count"
            type="number"
            min={0}
            max={openings}
            key={value}
            defaultValue={value}
            className="mt-1 w-28 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <SubmitButton variant="dark" pendingText="Guardando…">
          Actualizar
        </SubmitButton>
      </div>
      {state.error ? <p className="mt-2 text-sm text-brand-700" role="alert">{state.fieldErrors?.filled_count ?? state.error}</p> : null}
      {state.ok && state.message ? <p className="mt-2 text-sm text-emerald-700" role="status">{state.message}</p> : null}
    </form>
  );
}
