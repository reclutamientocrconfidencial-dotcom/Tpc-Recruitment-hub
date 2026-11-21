"use client";

import { useActionState } from "react";
import { Loader2, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { signInAction, type LoginState } from "@/app/login/actions";

const INITIAL: LoginState = { error: null };

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL);

  return (
    <form action={formAction} noValidate className="space-y-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink-950">
          Correo electrónico
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.email}
            aria-invalid={Boolean(state.fieldErrors?.email)}
            aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
            placeholder="nombre@empresa.com"
            className="w-full rounded-lg border border-neutral-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-brand-600"
          />
        </div>
        {state.fieldErrors?.email ? (
          <p id="email-error" className="mt-1.5 text-xs text-brand-700">{state.fieldErrors.email}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-950">
          Contraseña
        </label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(state.fieldErrors?.password)}
            aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
            placeholder="••••••••"
            className="w-full rounded-lg border border-neutral-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-brand-600"
          />
        </div>
        {state.fieldErrors?.password ? (
          <p id="password-error" className="mt-1.5 text-xs text-brand-700">{state.fieldErrors.password}</p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {pending ? "Ingresando…" : "Iniciar sesión"}
      </Button>
    </form>
  );
}
