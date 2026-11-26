"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Square } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { BatchProgress } from "@/modules/screening/actions";

type Start = (vacancyId: string, maxCost: number) => Promise<BatchProgress>;
type Step = (batchId: string) => Promise<BatchProgress>;

/**
 * Análisis por lotes: procesa una postulación por llamada, muestra el avance,
 * reutiliza resultados sin cambios y se detiene al llegar al tope de costo.
 */
export function BatchRunner({ vacancyId, start, step, cancel, external }: { vacancyId: string; start: Start; step: Step; cancel: Step; external: boolean }) {
  const router = useRouter();
  const [p, setP] = useState<BatchProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [maxCost, setMaxCost] = useState(5);
  const stop = useRef(false);

  async function run() {
    setRunning(true);
    stop.current = false;
    let cur = await start(vacancyId, maxCost);
    setP(cur);
    while (!cur.error && !cur.finished && cur.batchId && !stop.current) {
      cur = await step(cur.batchId);
      setP(cur);
    }
    if (stop.current && cur.batchId && !cur.finished) setP(await cancel(cur.batchId));
    setRunning(false);
    router.refresh();
  }

  const done = (p?.processed ?? 0) + (p?.reused ?? 0) + (p?.failed ?? 0);
  const pct = p?.total ? Math.round((100 * done) / p.total) : 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {external ? (
          <div className="space-y-1">
            <label htmlFor="batch-cost" className="block text-sm font-medium">Tope de costo del lote (US$)</label>
            <input id="batch-cost" type="number" min={0} max={100} step={0.5} value={maxCost} disabled={running} onChange={(e) => setMaxCost(Number(e.target.value) || 0)} className="w-32 rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </div>
        ) : null}
        {!running ? (
          <Button type="button" variant="secondary" onClick={run}>
            <Layers className="h-4 w-4" aria-hidden /> Analizar postulaciones activas
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={() => (stop.current = true)}>
            <Square className="h-4 w-4" aria-hidden /> Detener
          </Button>
        )}
      </div>
      {p?.error ? <Alert tone="error">{p.error}</Alert> : null}
      {p && !p.error ? (
        <div className="space-y-1" aria-live="polite">
          <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Avance del análisis">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-neutral-700">
            {done} de {p.total} · {p.processed} analizadas · {p.reused} reutilizadas sin costo · {p.failed} con error · US$ {(p.cost ?? 0).toFixed(4)}
            {p.finished ? ` · ${p.status === "completado" ? "Completado" : p.stopReason ?? "Detenido"}` : ""}
          </p>
          {p.lastError ? <p className="text-xs text-brand-700">Último error: {p.lastError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
