"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Habilitación de datos personales reales (paso final del despliegue, con autorización de la gerencia). */
export function RealDataForm({ action, enabled }: { action: Action; enabled: boolean }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form
      action={formAction}
      aria-label="Datos reales"
      className="space-y-3"
      onSubmit={(e) => {
        if (enabled && !window.confirm("¿Volver a limitar el sistema a datos ficticios? Los datos existentes se conservan.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="real_data" value={enabled ? "false" : "true"} />
      {!enabled ? (
        <div className="space-y-1">
          <label htmlFor="confirmacion" className="block text-sm font-medium">Escriba «HABILITAR DATOS REALES» para confirmar</label>
          <input id="confirmacion" name="confirmacion" autoComplete="off" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm sm:max-w-sm" />
        </div>
      ) : null}
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert>{state.message}</Alert> : null}
      <SubmitButton variant={enabled ? "secondary" : "dark"} pendingText="Guardando…">
        {enabled ? "Volver a solo datos ficticios" : "Habilitar datos reales"}
      </SubmitButton>
    </form>
  );
}
