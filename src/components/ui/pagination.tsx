import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { hrefWith } from "@/lib/search-params";
import { totalPages } from "@/lib/pagination";

/** Paginación por enlaces (funciona sin JavaScript y conserva los filtros). */
export function Pagination({
  path,
  params,
  page,
  total,
  pageSize,
}: {
  path: string;
  params: Record<string, string>;
  page: number;
  total: number;
  pageSize: number;
}) {
  const pages = totalPages(total, pageSize);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const link = (p: number) => hrefWith(path, params, { page: p === 1 ? null : p });
  const base = "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium";

  return (
    <nav aria-label="Paginación" className="mt-4 flex flex-col items-center justify-between gap-3 text-sm sm:flex-row">
      <p className="text-neutral-500" aria-live="polite">
        Mostrando <strong className="text-ink-950">{from}–{to}</strong> de <strong className="text-ink-950">{total}</strong>
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={link(page - 1)} className={cn(base, "border border-neutral-300 bg-white hover:bg-neutral-50")} rel="prev">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
          </Link>
        ) : (
          <span className={cn(base, "cursor-not-allowed border border-neutral-200 text-neutral-400")} aria-disabled>
            <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
          </span>
        )}
        <span className="px-2 text-neutral-600">
          Página {page} de {pages}
        </span>
        {page < pages ? (
          <Link href={link(page + 1)} className={cn(base, "border border-neutral-300 bg-white hover:bg-neutral-50")} rel="next">
            Siguiente <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <span className={cn(base, "cursor-not-allowed border border-neutral-200 text-neutral-400")} aria-disabled>
            Siguiente <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
