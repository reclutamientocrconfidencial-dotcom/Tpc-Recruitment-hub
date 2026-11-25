import Link from "next/link";
import { Lock } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

export function Forbidden({ message = "No tiene permiso para acceder a esta sección." }: { message?: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
      <Lock className="mx-auto mb-3 h-8 w-8 text-brand-600" aria-hidden />
      <h1 className="text-lg font-bold">Acceso restringido</h1>
      <p className="mt-2 text-sm text-neutral-500">{message}</p>
      <Link href="/dashboard" className={buttonClasses("dark", "mt-6")}>
        Volver al dashboard
      </Link>
    </div>
  );
}
