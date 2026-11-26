"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function MfaRequiredForm({ action, required, missing }: { action: Action; required: boolean; missing: number }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const text = required
          ? "¿Dejar de exigir la verificación en dos pasos?"
          : missing > 0
            ? `${missing} usuario(s) activo(s) aún no la tienen: solo podrán configurarla hasta hacerlo. ¿Exigirla ahora?`
            : "¿Exigir la verificación en dos pasos a todos los usuarios?";
        if (!window.confirm(text)) e.preventDefault();
      }}
    >
      <input type="hidden" name="mfa_required" value={required ? "false" : "true"} />
      {state.error ? <Alert tone="error" className="mb-3">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert className="mb-3">{state.message}</Alert> : null}
      <SubmitButton variant={required ? "secondary" : "primary"} pendingText="Guardando…">
        {required ? "Dejar de exigir" : "Exigir a todos los usuarios"}
      </SubmitButton>
    </form>
  );
}
