"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function ResetPipelineButton({ action, clientId, templateId }: { action: Action; clientId: string; templateId: string }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("¿Volver al proceso estándar TPC? Se eliminará el proceso propio de este cliente.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="template_id" value={templateId} />
      <SubmitButton variant="ghost" pendingText="Restableciendo…">Usar proceso estándar</SubmitButton>
      {state.error ? <p className="mt-1 text-xs text-brand-700" role="alert">{state.error}</p> : null}
    </form>
  );
}
