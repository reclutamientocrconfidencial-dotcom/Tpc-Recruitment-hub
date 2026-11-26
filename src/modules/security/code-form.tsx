"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { MfaState } from "@/modules/security/mfa-actions";

type Action = (prev: MfaState, formData: FormData) => Promise<MfaState>;

/** Campo de código de 6 dígitos (teclado numérico en el celular, autocompletado de códigos). */
export function CodeInput({ id = "code" }: { id?: string }) {
  return (
    <input
      id={id}
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9 ]*"
      maxLength={7}
      required
      autoFocus
      className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
    />
  );
}

/** Paso 2 del inicio de sesión. */
export function LoginCodeForm({ action, next }: { action: Action; next: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} aria-label="Código de verificación" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error ? <Alert tone="error" className="mb-4">{state.error}</Alert> : null}
      <label htmlFor="code" className="block text-sm font-medium text-ink-950">
        Código de 6 dígitos
      </label>
      <CodeInput />
      <SubmitButton className="mt-5 w-full" pendingText="Verificando…">
        Verificar
      </SubmitButton>
    </form>
  );
}
