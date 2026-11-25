import Link from "next/link";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { NAV_ITEMS } from "@/components/layout/nav";
import { can } from "@/lib/auth/permissions";
import { requireSessionUser } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/env";
import { getMfaStatus } from "@/modules/security/repository";
import { IDLE_TIMEOUT_MINUTES } from "@/modules/security/schema";
import { IdleLogout } from "@/components/layout/idle-logout";
import { buttonClasses } from "@/components/ui/button";
import { signOutAction } from "@/app/(app)/actions";

// Páginas siempre dinámicas: dependen de la sesión y de RLS.
export const dynamic = "force-dynamic";
// Las lecturas de datos nunca se almacenan en caché (también en Cloudflare/OpenNext).
export const fetchCache = "force-no-store";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSessionUser();
  const demo = isDemoMode();
  const mfa = await getMfaStatus();
  // Verificación en dos pasos obligatoria y sesión sin código: la BD no entrega datos (aal2).
  const mfaBlocked = mfa.required && mfa.level !== "aal2";
  const items = mfaBlocked ? [] : NAV_ITEMS.filter((item) => can(user.role, item.permission));

  return (
    <div className="flex min-h-screen">
      {demo ? null : <IdleLogout minutes={IDLE_TIMEOUT_MINUTES} action={signOutAction} />}
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} demo={demo} />
        <MobileNav items={items} />
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {mfaBlocked ? (
            <div className="mx-auto mt-16 max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
              <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-brand-600" aria-hidden />
              <h1 className="text-lg font-bold">Verificación en dos pasos obligatoria</h1>
              <p className="mt-2 text-sm text-neutral-500">
                Para proteger los datos personales, configure una aplicación autenticadora en su celular antes de continuar.
              </p>
              <Link href="/cuenta/seguridad" className={`${buttonClasses("primary")} mt-5`}>
                Configurar ahora
              </Link>
            </div>
          ) : user.role ? (
            children
          ) : (
            <div className="mx-auto mt-16 max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
              <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-brand-600" aria-hidden />
              <h1 className="text-lg font-bold">Cuenta pendiente de activación</h1>
              <p className="mt-2 text-sm text-neutral-500">
                Su usuario no tiene un rol activo. Solicite a un administrador que habilite su acceso.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
