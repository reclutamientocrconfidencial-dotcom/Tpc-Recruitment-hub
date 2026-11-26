"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Botón de una acción de servidor con campos ocultos y mensaje de resultado. */
export function InlineAction({
  action,
  fields,
  label,
  variant = "secondary",
  confirmText,
  children,
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  variant?: "primary" | "secondary" | "dark" | "ghost";
  confirmText?: string;
  /** Controles adicionales del formulario (p. ej. un selector). */
  children?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="flex flex-wrap items-end gap-2">
        {children}
        <SubmitButton variant={variant} pendingText="Procesando…">
          {label}
        </SubmitButton>
      </div>
      {state.error ? <p className="mt-2 text-sm text-brand-700" role="alert">{state.error}</p> : null}
      {state.ok && state.message ? <p className="mt-2 text-sm text-emerald-700" role="status">{state.message}</p> : null}
    </form>
  );
}
