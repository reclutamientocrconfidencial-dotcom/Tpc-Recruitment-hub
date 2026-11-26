"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, SelectInput, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { TASK_KIND, optionsFrom } from "@/modules/labels";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type Opt = { value: string; label: string };

export function TaskForm({ action, users, clients, canAssign, defaultUser }: { action: Action; users: Opt[]; clients: Opt[]; canAssign: boolean; defaultUser: string }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} aria-label="Nueva tarea" className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok ? <p className="text-sm text-emerald-700" role="status">{state.message}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="t-title" label="Tarea" required error={e.title} className="sm:col-span-2">
          <TextInput id="t-title" name="title" maxLength={200} placeholder="Ej.: llamar al cliente por la terna" error={e.title} />
        </Field>
        <Field id="t-kind" label="Tipo">
          <SelectInput id="t-kind" name="kind" defaultValue="recordatorio" options={optionsFrom(TASK_KIND)} />
        </Field>
        <Field id="t-due" label="Fecha y hora" required error={e.due_at}>
          <TextInput id="t-due" name="due_at" type="datetime-local" error={e.due_at} />
        </Field>
        <Field id="t-client" label="Cliente (opcional)">
          <SelectInput id="t-client" name="client_id" defaultValue="" placeholder="Ninguno" options={clients} />
        </Field>
        {canAssign ? (
          <Field id="t-assignee" label="Responsable">
            <SelectInput id="t-assignee" name="assigned_to" defaultValue={defaultUser} options={users} />
          </Field>
        ) : null}
        <Field id="t-notes" label="Notas (opcional)" className={canAssign ? "sm:col-span-2" : "sm:col-span-3"}>
          <TextInput id="t-notes" name="notes" maxLength={1000} />
        </Field>
      </div>
      <SubmitButton variant="secondary">Agregar tarea</SubmitButton>
    </form>
  );
}

export function CalendarForm({ rotate, revoke, active, feedBase }: { rotate: (prev: ActionState) => Promise<ActionState>; revoke: (prev: ActionState) => Promise<ActionState>; active: boolean; feedBase: string }) {
  const [state, rotateAction] = useActionState(rotate, INITIAL_ACTION_STATE);
  const [revState, revokeAction] = useActionState(revoke, INITIAL_ACTION_STATE);
  const token = state.ok ? state.values?.token : undefined;
  return (
    <div className="space-y-3 text-sm">
      {state.error || revState.error ? <Alert tone="error">{state.error ?? revState.error}</Alert> : null}
      {token ? (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p role="status">{state.message}</p>
          <label htmlFor="cal-url" className="block font-medium">
            Enlace de suscripción (Google Calendar: «Otros calendarios → Desde URL»; Outlook: «Agregar calendario → Desde Internet»)
          </label>
          <input id="cal-url" readOnly value={`${feedBase}/api/calendario/${token}`} className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        </div>
      ) : revState.ok ? (
        <p className="text-emerald-700" role="status">{revState.message}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <form action={rotateAction}>
          <SubmitButton variant="secondary" pendingText="Generando…">
            {active ? "Renovar enlace" : "Generar enlace de calendario"}
          </SubmitButton>
        </form>
        {active ? (
          <form action={revokeAction}>
            <SubmitButton variant="ghost" pendingText="Revocando…">
              Revocar enlace
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}
