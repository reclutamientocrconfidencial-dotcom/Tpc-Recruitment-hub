import { LogOut } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { initials } from "@/lib/format";
import type { SessionUser } from "@/lib/auth/session";
import { signOutAction } from "@/app/(app)/actions";

export function Topbar({ user, demo }: { user: SessionUser; demo: boolean }) {
  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 sm:px-6">
      <div className="lg:hidden">
        <Logo />
      </div>
      <div className="hidden items-center gap-2 lg:flex">
        {demo ? (
          <span className="rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
            Modo demostración · datos ficticios
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold text-ink-950">{user.fullName}</p>
          <p className="text-xs text-neutral-500">{user.role ? ROLE_LABELS[user.role] : "Sin rol asignado"}</p>
        </div>
        <div
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-950 text-xs font-bold text-white ring-2 ring-brand-600"
        >
          {initials(user.fullName)}
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-brand-600"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="sr-only">Cerrar sesión</span>
          </button>
        </form>
      </div>
    </header>
  );
}
