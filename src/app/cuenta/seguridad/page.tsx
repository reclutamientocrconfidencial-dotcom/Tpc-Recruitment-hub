import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { requireSessionUser } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/env";
import { getMfaStatus } from "@/modules/security/repository";
import { MfaSetup, RemoveFactor } from "@/modules/security/mfa-setup";
import { confirmEnrollAction, removeFactorAction, startEnrollAction } from "@/modules/security/mfa-actions";
import { signOutAction } from "@/app/(app)/actions";

export const metadata: Metadata = { title: "Mi seguridad" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const DATE = new Intl.DateTimeFormat("es-CR", { dateStyle: "medium", timeZone: "America/Costa_Rica" });

/**
 * Fuera del grupo (app): debe estar disponible aunque la verificación en dos
 * pasos sea obligatoria y el usuario todavía no la tenga.
 */
export default async function MiSeguridadPage() {
  const user = await requireSessionUser();
  const status = await getMfaStatus();
  const active = status.factors.length > 0;

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <form action={signOutAction}>
            <button type="submit" className="text-sm text-neutral-500 hover:text-brand-600 hover:underline">
              Cerrar sesión
            </button>
          </form>
        </div>
        <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver al sistema
        </Link>
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-ink-950">
          <ShieldCheck className="h-6 w-6 text-brand-600" aria-hidden /> Mi seguridad
        </h1>
        <p className="mb-6 text-sm text-neutral-500">{user.email}</p>

        {isDemoMode() ? <Alert className="mb-4">Modo demostración: la verificación en dos pasos solo está disponible con Supabase.</Alert> : null}
        {status.required && !active ? (
          <Alert tone="error" className="mb-4">
            La verificación en dos pasos es obligatoria. Configúrela para poder acceder a la información del sistema.
          </Alert>
        ) : null}

        <Card>
          <CardHeader
            title="Verificación en dos pasos"
            description="Además de la contraseña, se pide un código temporal de su celular. Protege los datos personales de candidatos (Ley 8968)."
            action={
              active ? (
                <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Activada</span>
              ) : (
                <span className="rounded bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-600">No configurada</span>
              )
            }
          />
          <div className="px-5 py-5">
            {active ? (
              <ul className="space-y-3">
                {status.factors.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {f.name} · configurada el {DATE.format(new Date(f.createdAt))}
                    </span>
                    {status.level === "aal2" ? <RemoveFactor action={removeFactorAction} factorId={f.id} name={f.name} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <MfaSetup start={startEnrollAction} confirm={confirmEnrollAction} />
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
