"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { APP_ROLES, type Profile } from "@/types/database";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const CONTROL =
  "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:bg-neutral-100 disabled:text-neutral-500";

/** Edición en línea de un usuario (fila de la tabla de administración). */
export function UserRowForm({ action, user, isSelf }: { action: Action; user: Profile; isSelf: boolean }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const label = user.full_name || user.email;
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3" aria-label={`Editar ${label}`}>
      <input type="hidden" name="id" value={user.id} />
      <input
        name="full_name"
        aria-label={`Nombre de ${label}`}
        defaultValue={user.full_name}
        maxLength={150}
        className={`${CONTROL} w-44`}
      />
      <select name="role" aria-label={`Rol de ${label}`} defaultValue={user.role} disabled={isSelf} className={CONTROL}>
        {APP_ROLES.map((r) => (
          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
        ))}
      </select>
      {isSelf ? <input type="hidden" name="role" value={user.role} /> : null}
      <label className="inline-flex items-center gap-1.5 text-sm">
        <input type="checkbox" name="is_active" defaultChecked={user.is_active} disabled={isSelf} className="h-4 w-4 accent-brand-600" />
        Activo
      </label>
      {isSelf ? <input type="hidden" name="is_active" value="true" /> : null}
      <SubmitButton variant="dark" pendingText="…">Guardar</SubmitButton>
      {state.error ? <span role="alert" className="text-xs text-brand-700">{state.error}</span> : null}
      {state.ok ? <span role="status" className="text-xs text-emerald-700">{state.message}</span> : null}
    </form>
  );
}
