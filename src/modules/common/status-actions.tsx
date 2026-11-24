"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Botones de cambio de estado (solo transiciones válidas; la base de datos vuelve a validar). */
export function StatusActions({
  action,
  id,
  options,
  confirm = {},
}: {
  action: Action;
  id: string;
  options: Array<{ status: string; label: string; variant?: "primary" | "secondary" | "dark" | "ghost" }>;
  /** Mensajes de confirmación por estado destino. */
  confirm?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  if (options.length === 0) return null;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <form
            key={o.status}
            action={formAction}
            onSubmit={(e) => {
              const text = confirm[o.status];
              if (text && !window.confirm(text)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value={o.status} />
            <SubmitButton variant={o.variant ?? "secondary"} pendingText="Actualizando…">
              {o.label}
            </SubmitButton>
          </form>
        ))}
      </div>
      {state.error ? <p className="mt-2 text-sm text-brand-700" role="alert">{state.error}</p> : null}
      {state.ok && state.message ? <p className="mt-2 text-sm text-emerald-700" role="status">{state.message}</p> : null}
    </div>
  );
}
