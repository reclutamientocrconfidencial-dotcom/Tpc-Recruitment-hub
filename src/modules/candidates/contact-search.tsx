"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Search } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ContactSearchState } from "@/modules/candidates/actions";

/** Búsqueda por cédula, correo o teléfono (queda registrada en el registro de accesos). */
export function ContactSearch({ action }: { action: (prev: ContactSearchState, formData: FormData) => Promise<ContactSearchState> }) {
  const [state, formAction] = useActionState(action, {} as ContactSearchState);
  return (
    <form action={formAction} className="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm" role="search" aria-label="Buscar por dato de contacto">
      <label htmlFor="contacto" className="block text-sm font-medium text-ink-950">
        Buscar por cédula, correo o teléfono
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="contacto"
          name="contacto"
          autoComplete="off"
          maxLength={200}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
        <SubmitButton variant="dark" pendingText="Buscando…">
          <Search className="h-4 w-4" aria-hidden /> Buscar
        </SubmitButton>
      </div>
      <p className="mt-1 text-xs text-neutral-500">La búsqueda por datos sensibles queda registrada.</p>
      {state.error ? <p className="mt-2 text-sm text-brand-700" role="alert">{state.error}</p> : null}
      {state.results ? (
        state.results.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600" role="status">Sin coincidencias.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm" role="status">
            {state.results.map((r) => (
              <li key={r.candidate_id}>
                <Link href={`/candidatos/${r.candidate_id}`} className="font-semibold text-brand-700 hover:underline">
                  {r.full_name}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </form>
  );
}
