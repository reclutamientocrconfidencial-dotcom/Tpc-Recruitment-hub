import { coverage } from "@/modules/workflow";

/** Plazas cubiertas / pendientes con barra de progreso accesible. */
export function CoverageBar({ openings, filled, compact = false }: { openings: number; filled: number; compact?: boolean }) {
  const c = coverage(openings, filled);
  return (
    <div className={compact ? "min-w-28" : ""}>
      <div className="flex justify-between text-xs text-neutral-600">
        <span>
          {c.filled}/{c.total} cubiertas
        </span>
        {c.pending > 0 ? <span className="font-semibold text-brand-700">{c.pending} pendientes</span> : <span className="font-semibold text-emerald-700">Completo</span>}
      </div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200"
        role="progressbar"
        aria-label="Plazas cubiertas"
        aria-valuemin={0}
        aria-valuemax={c.total}
        aria-valuenow={c.filled}
      >
        <div className={`h-full ${c.pending === 0 && c.total > 0 ? "bg-emerald-600" : "bg-brand-600"}`} style={{ width: `${c.percent}%` }} />
      </div>
    </div>
  );
}
