import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { LoginCodeForm } from "@/modules/security/code-form";
import { verifyLoginCodeAction } from "@/modules/security/mfa-actions";
import { signOutAction } from "@/app/(app)/actions";
import { safeRedirectPath } from "@/lib/validation";

export const metadata: Metadata = { title: "Verificación en dos pasos" };
export const dynamic = "force-dynamic";

export default async function VerificacionPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-12">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <Logo className="mb-8" />
        <div className="mb-6 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-brand-600" aria-hidden />
          <h1 className="text-xl font-bold text-ink-950">Verificación en dos pasos</h1>
        </div>
        <p className="mb-5 text-sm text-neutral-600">Abra su aplicación autenticadora en el celular e ingrese el código que muestra para TPC Recruitment Hub.</p>
        <LoginCodeForm action={verifyLoginCodeAction} next={next} />
        <form action={signOutAction} className="mt-4 text-center">
          <button type="submit" className="text-sm text-neutral-500 hover:text-brand-600 hover:underline">
            Cancelar y cerrar sesión
          </button>
        </form>
        <p className="mt-6 text-xs text-neutral-500">¿Perdió el celular? Solicite a un administrador que restablezca su verificación.</p>
      </div>
    </main>
  );
}
