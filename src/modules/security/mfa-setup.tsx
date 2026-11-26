"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { CodeInput } from "@/modules/security/code-form";
import type { MfaState } from "@/modules/security/mfa-actions";

type Action = (prev: MfaState, formData: FormData) => Promise<MfaState>;

/** Configuración de la aplicación autenticadora: QR → código → activada. */
export function MfaSetup({ start, confirm }: { start: Action; confirm: Action }) {
  const [startState, startAction] = useActionState(start, {});
  const [confirmState, confirmAction] = useActionState(confirm, {});
  const enrollment = startState.enrollment;

  if (confirmState.ok) return <Alert>{confirmState.message}</Alert>;

  if (!enrollment) {
    return (
      <form action={startAction} aria-label="Configurar verificación en dos pasos">
        {startState.error ? <Alert tone="error" className="mb-3">{startState.error}</Alert> : null}
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-neutral-700">
          <li>Instale en su celular una aplicación autenticadora gratuita (Google Authenticator, Microsoft Authenticator u otra).</li>
          <li>Pulse «Comenzar» y escanee el código QR con esa aplicación.</li>
          <li>Escriba el código de 6 dígitos que aparece en la aplicación.</li>
        </ol>
        <SubmitButton pendingText="Preparando…">Comenzar</SubmitButton>
      </form>
    );
  }

  return (
    <form action={confirmAction} aria-label="Confirmar verificación en dos pasos" noValidate>
      <input type="hidden" name="factor_id" value={enrollment.factorId} />
      {confirmState.error ? <Alert tone="error" className="mb-3">{confirmState.error}</Alert> : null}
      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        {/* El QR lo genera Supabase Auth como SVG (data URI, permitido por la CSP). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enrollment.qr} alt="Código QR para la aplicación autenticadora" width={192} height={192} className="rounded-lg border border-neutral-200 bg-white p-2" />
        <div className="space-y-3 text-sm">
          <p>Escanee el código QR con su aplicación autenticadora.</p>
          <p>
            ¿No puede escanearlo? Ingrese esta clave manualmente:
            <code className="mt-1 block break-all rounded bg-neutral-100 px-2 py-1 font-mono text-xs" data-testid="mfa-secret">
              {enrollment.secret}
            </code>
          </p>
          <div>
            <label htmlFor="enroll-code" className="block font-medium text-ink-950">
              Código de 6 dígitos
            </label>
            <CodeInput id="enroll-code" />
          </div>
          <SubmitButton pendingText="Verificando…">Activar</SubmitButton>
        </div>
      </div>
    </form>
  );
}

/** Eliminar una aplicación autenticadora (con confirmación). */
export function RemoveFactor({ action, factorId, name }: { action: Action; factorId: string; name: string }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("¿Eliminar esta aplicación autenticadora? Si la verificación es obligatoria, deberá configurar otra.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="factor_id" value={factorId} />
      <SubmitButton variant="ghost" pendingText="Eliminando…">{`Eliminar ${name}`}</SubmitButton>
      {state.error ? <p className="mt-1 text-xs text-brand-700" role="alert">{state.error}</p> : null}
      {state.ok ? <p className="mt-1 text-xs text-emerald-700" role="status">{state.message}</p> : null}
    </form>
  );
}
