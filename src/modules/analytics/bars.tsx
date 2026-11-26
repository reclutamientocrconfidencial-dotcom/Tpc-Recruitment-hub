/**
 * Tabla con barra horizontal de una sola serie (magnitud): el valor siempre va
 * como texto (no solo color), la barra es decorativa y la tabla es la vista
 * accesible. Color único de la marca; el texto usa las tintas de texto.
 */
export interface BarRow {
  key: string;
  label: string;
  value: number;
  valueLabel?: string;
  extra?: Array<string | number | null>;
  tooltip?: string;
}

export function BarTable({ caption, label, valueHeader, extraHeaders = [], rows, empty = "Sin datos en el período." }: { caption: string; label: string; valueHeader: string; extraHeaders?: string[]; rows: BarRow[]; empty?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="px-5 py-4 text-sm text-neutral-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
            <th scope="col" className="px-5 py-2 font-medium">{label}</th>
            <th scope="col" className="w-2/5 px-3 py-2 font-medium">{valueHeader}</th>
            {extraHeaders.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 text-right font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50" title={r.tooltip ?? `${r.label}: ${r.valueLabel ?? r.value}`}>
              <th scope="row" className="px-5 py-2 text-left font-medium text-ink-950">{r.label}</th>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 flex-1 rounded-full bg-neutral-100" aria-hidden>
                    <div className="h-2.5 rounded-full bg-brand-600" style={{ width: `${max && r.value > 0 ? Math.max(2, (r.value / max) * 100) : 0}%` }} />
                  </div>
                  <span className="w-14 shrink-0 text-right tabular-nums text-ink-950">{r.valueLabel ?? r.value}</span>
                </div>
              </td>
              {(r.extra ?? []).map((x, i) => (
                <td key={i} className="px-3 py-2 text-right tabular-nums text-neutral-700">{x ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
