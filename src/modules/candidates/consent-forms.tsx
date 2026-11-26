"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SelectInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { CONSENT_CHANNEL, optionsFrom } from "@/modules/labels";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function RevokeConsentForm({ action, consentId, candidateId }: { action: Action; consentId: string; candidateId: string }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2" aria-label="Revocar consentimiento">
      <input type="hidden" name="consent_id" value={consentId} />
      <input type="hidden" name="candidate_id" value={candidateId} />
      <div>
        <label htmlFor={`reason-${consentId}`} className="block text-xs font-medium text-neutral-600">
          Motivo de la revocación
        </label>
        <input id={`reason-${consentId}`} name="reason" maxLength={300} className="mt-1 w-64 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
      </div>
      <SubmitButton variant="ghost" pendingText="Revocando…">
        Revocar
      </SubmitButton>
      {state.error ? <p className="w-full text-xs text-brand-700" role="alert">{state.error}</p> : null}
      {state.ok ? <p className="w-full text-xs text-emerald-700" role="status">{state.message}</p> : null}
    </form>
  );
}

export function AddConsentForm({ action, candidateId, version }: { action: Action; candidateId: string; version: string }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-dashed border-neutral-300 p-3" aria-label="Registrar consentimiento">
      <input type="hidden" name="candidate_id" value={candidateId} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok ? <Alert>{state.message}</Alert> : null}
      <p className="text-sm font-semibold">Registrar consentimiento (versión {version})</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="consent_given" className="h-4 w-4 accent-brand-600" /> El candidato aceptó la versión vigente.
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <SelectInput id={`consent_channel-${candidateId}`} name="consent_channel" aria-label="Canal del consentimiento" defaultValue="" placeholder="¿Cómo lo otorgó?" options={optionsFrom(CONSENT_CHANNEL)} />
        <input name="consent_evidence" aria-label="Evidencia" placeholder="Evidencia" maxLength={300} className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <SubmitButton variant="dark" pendingText="Guardando…">
        Registrar
      </SubmitButton>
    </form>
  );
}
