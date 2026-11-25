"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Fusión de dos fichas: se elige cuál conservar (la otra queda «fusionada»). */
export function MergeForm({ action, a, b }: { action: Action; a: { id: string; name: string }; b: { id: string; name: string } }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form
      action={(fd) => {
        const keep = fd.get("keep");
        fd.set("remove", keep === a.id ? b.id : a.id);
        formAction(fd);
      }}
      onSubmit={(e) => {
        if (!window.confirm("¿Fusionar las dos fichas? Las postulaciones, perfiles y consentimientos pasan a la ficha conservada.")) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3 text-sm"
      aria-label={`Fusionar ${a.name}`}
    >
      <span>Conservar:</span>
      <label className="flex items-center gap-1">
        <input type="radio" name="keep" value={a.id} defaultChecked className="accent-brand-600" /> {a.name} (A)
      </label>
      <label className="flex items-center gap-1">
        <input type="radio" name="keep" value={b.id} className="accent-brand-600" /> {b.name} (B)
      </label>
      <SubmitButton variant="dark" pendingText="Fusionando…">
        Fusionar
      </SubmitButton>
      {state.error ? <span className="text-xs text-brand-700" role="alert">{state.error}</span> : null}
      {state.ok ? <span className="text-xs text-emerald-700" role="status">{state.message}</span> : null}
    </form>
  );
}
