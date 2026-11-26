"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { DATASETS, type Dataset } from "@/modules/analytics/datasets";

/** Formulario de exportación controlada (POST al servidor; la BD registra cada exportación). */
export function ExportForm({ from, to, clientId, isAdmin }: { from: string; to: string; clientId: string; isAdmin: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <form method="post" action="/api/exportaciones" aria-label="Exportar datos" className="space-y-3">
      <input type="hidden" name="desde" value={from} />
      <input type="hidden" name="hasta" value={to} />
      <input type="hidden" name="cliente" value={clientId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="exp-dataset" className="mb-1.5 block text-sm font-medium">Conjunto de datos</label>
          <select id="exp-dataset" name="dataset" defaultValue="indicadores_clientes" className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm">
            {(Object.keys(DATASETS) as Dataset[])
              .filter((k) => isAdmin || !DATASETS[k].adminOnly)
              .map((k) => (
                <option key={k} value={k}>{DATASETS[k].label}</option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor="exp-format" className="mb-1.5 block text-sm font-medium">Formato</label>
          <select id="exp-format" name="format" defaultValue="xlsx" className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm">
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="exp-reason" className="mb-1.5 block text-sm font-medium">Motivo de la exportación (obligatorio)</label>
        <input id="exp-reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={300} required placeholder="Ej.: informe mensual para la gerencia" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
      </div>
      <p className="text-xs text-neutral-500">
        Se exporta el período y el cliente filtrados arriba. Máximo 5.000 filas y 20 exportaciones por día. Nunca se incluyen cédula ni datos de contacto. Cada exportación queda registrada con su motivo.
      </p>
      <button type="submit" disabled={reason.trim().length < 10} className="inline-flex items-center gap-2 rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
        <Download className="h-4 w-4" aria-hidden /> Exportar
      </button>
    </form>
  );
}
