import type { Metadata } from "next";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Alert } from "@/components/ui/alert";
import { LoginForm } from "@/app/login/login-form";
import { COMPANY_NAME, isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { DEMO_CREDENTIALS } from "@/lib/demo/data";
import { safeRedirectPath } from "@/lib/validation";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; motivo?: string }> }) {
  const params = await searchParams;
  const next = params.next ? safeRedirectPath(params.next) : undefined;
  const demo = isDemoMode();
  const configured = isSupabaseConfigured();

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-ink-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-600/30 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-700/20 blur-3xl" aria-hidden />
        <Logo inverted className="relative" />
        <div className="relative max-w-md">
          <div className="mb-6 h-1 w-16 rounded bg-brand-600" />
          <h1 className="text-4xl font-bold leading-tight">Talento correcto, en el lugar correcto.</h1>
          <p className="mt-4 text-neutral-400">
            Gestione clientes, requisiciones, vacantes, candidatos y postulaciones en una sola plataforma segura.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-neutral-300">
            {["Control de acceso por rol y por usuario", "Datos protegidos conforme a la Ley 8968", "Trazabilidad completa del proceso"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-500" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-neutral-500">© {new Date().getFullYear()} {COMPANY_NAME} · Costa Rica</p>
      </section>

      <section className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <h2 className="text-2xl font-bold text-ink-950">Iniciar sesión</h2>
          <p className="mt-1 mb-8 text-sm text-neutral-500">Ingrese con su cuenta corporativa.</p>

          {params.motivo === "inactividad" ? (
            <Alert className="mb-5">Su sesión se cerró por inactividad para proteger la información. Ingrese de nuevo.</Alert>
          ) : null}
          {params.error === "auth" ? (
            <Alert tone="error" className="mb-5">El enlace de verificación no es válido o expiró.</Alert>
          ) : null}

          {demo ? (
            <Alert className="mb-5" title="Modo demostración">
              Datos ficticios. Use <strong>{DEMO_CREDENTIALS.email}</strong> / <strong>{DEMO_CREDENTIALS.password}</strong>
            </Alert>
          ) : !configured ? (
            <Alert tone="error" className="mb-5" title="Configuración pendiente">
              Defina NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (vea README.md).
            </Alert>
          ) : null}

          <LoginForm next={next} />

          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-neutral-400">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Acceso exclusivo para personal autorizado
          </p>
        </div>
      </section>
    </main>
  );
}
