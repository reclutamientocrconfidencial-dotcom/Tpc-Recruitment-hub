"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Botón (y texto opcional) para ejecutar una función de IA. */
export function AiRunForm({ action, fields, label, withText }: { action: Action; fields: Record<string, string>; label: string; withText?: boolean }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} aria-label={label} className="space-y-2">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {withText ? (
        <>
          <label htmlFor={`ai-text-${fields.feature}`} className="block text-sm font-medium">
            Texto del currículum
          </label>
          <textarea id={`ai-text-${fields.feature}`} name="text" rows={6} maxLength={30000} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="Pegue aquí el texto del CV. Los datos personales se seudonimizan antes de enviarlos." />
        </>
      ) : null}
      <SubmitButton variant="secondary" pendingText="Consultando…">
        <Sparkles className="h-4 w-4" aria-hidden /> {label}
      </SubmitButton>
      {state.error ? <p className="text-sm text-brand-700" role="alert">{state.error}</p> : null}
      {state.ok && state.message ? <p className="text-sm text-emerald-700" role="status">{state.message}</p> : null}
    </form>
  );
}
