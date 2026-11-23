import Link from "next/link";
import { Search } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/**
 * Barra de filtros: formulario GET, de modo que los filtros quedan en la URL
 * (se pueden compartir o guardar) y funcionan sin JavaScript.
 */
export function FilterBar({ path, children, active }: { path: string; children: React.ReactNode; active: boolean }) {
  return (
    <form method="get" action={path} role="search" className="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{children}</div>
      <div className="mt-3 flex justify-end gap-2">
        {active ? (
          <Link href={path} className={buttonClasses("ghost")}>
            Limpiar filtros
          </Link>
        ) : null}
        <button type="submit" className={buttonClasses("dark")}>
          <Search className="h-4 w-4" aria-hidden />
          Filtrar
        </button>
      </div>
    </form>
  );
}
