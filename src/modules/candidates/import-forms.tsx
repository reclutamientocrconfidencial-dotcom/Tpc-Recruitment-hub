"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const LABEL = { crear: "Crear nuevo (es otra persona)", actualizar: "Completar el existente", omitir: "Omitir" } as const;

/** Decisión humana sobre una fila con posible duplicado. */
export function DecisionForm({
  action,
  batchId,
  row,
  current,
  options,
}: {
  action: Action;
  batchId: string;
  row: number;
  current: string | null;
  options: Array<keyof typeof LABEL>;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2" aria-label={`Decisión para la fila ${row}`}>
      <input type="hidden" name="batch_id" value={batchId} />
      <input type="hidden" name="row_number" value={row} />
      <select
        name="decision"
        defaultValue={current ?? ""}
        aria-label={`Decisión fila ${row}`}
        className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm"
      >
        <option value="" disabled>
          Elegir…
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {LABEL[o]}
          </option>
        ))}
      </select>
      <SubmitButton variant="secondary" pendingText="…">
        Guardar
      </SubmitButton>
      {state.error ? <span className="text-xs text-brand-700" role="alert">{state.error}</span> : null}
      {state.ok ? <span className="text-xs text-emerald-700" role="status">✓</span> : null}
    </form>
  );
}

/** Botón de acción del lote (importar, cancelar, revertir) con confirmación y motivo opcional. */
export function BatchActionForm({
  action,
  batchId,
  label,
  confirmText,
  withReason = false,
  variant = "primary",
}: {
  action: Action;
  batchId: string;
  label: string;
  confirmText: string;
  withReason?: boolean;
  variant?: "primary" | "secondary" | "dark" | "ghost";
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="batch_id" value={batchId} />
      {withReason ? (
        <div>
          <label htmlFor={`reason-${label}`} className="block text-sm font-medium">
            Motivo
          </label>
          <input id={`reason-${label}`} name="reason" maxLength={300} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      ) : null}
      <SubmitButton variant={variant} pendingText="Procesando…">
        {label}
      </SubmitButton>
      {state.error ? <p className="text-sm text-brand-700" role="alert">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-700" role="status">{state.message}</p> : null}
    </form>
  );
}
