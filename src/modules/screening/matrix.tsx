import { Badge } from "@/components/ui/badge";
import { MATCH_LABEL, type MatchStatus, type Preselection } from "@/lib/ai/features";
import type { LabelDef } from "@/modules/labels";

export const MATCH_BADGE: Record<MatchStatus, LabelDef> = {
  confirmado: { label: MATCH_LABEL.confirmado, tone: "success" },
  parcial: { label: MATCH_LABEL.parcial, tone: "warning" },
  incumplido: { label: MATCH_LABEL.incumplido, tone: "red" },
  insuficiente: { label: MATCH_LABEL.insuficiente, tone: "muted" },
};

/** Símbolo accesible (no depende solo del color). */
export const MATCH_SYMBOL: Record<MatchStatus, string> = { confirmado: "✓", parcial: "◐", incumplido: "✗", insuficiente: "?" };

function Items({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <ul className="list-disc pl-5">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

/** Matriz de cumplimiento por requisito, con evidencia y pendientes (texto plano). */
export function ScreeningMatrix({ data }: { data: Preselection }) {
  return (
    <div className="space-y-3 text-sm">
      <p>{data.resumen}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <caption className="sr-only">Matriz de cumplimiento</caption>
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th scope="col" className="py-2 pr-3">Requisito</th>
              <th scope="col" className="py-2 pr-3">Estado</th>
              <th scope="col" className="py-2 pr-3">Evidencia</th>
              <th scope="col" className="py-2">Pendiente de verificar</th>
            </tr>
          </thead>
          <tbody>
            {data.matriz.map((m, i) => (
              <tr key={i} className="border-b border-neutral-100 align-top">
                <th scope="row" className="py-2 pr-3 font-medium">
                  {m.requisito}
                  <span className="block text-xs font-normal text-neutral-500">{m.tipo}</span>
                </th>
                <td className="py-2 pr-3"><Badge def={MATCH_BADGE[m.estado] ?? MATCH_BADGE.insuficiente} /></td>
                <td className="py-2 pr-3 text-neutral-700">{m.evidencia || "—"}</td>
                <td className="py-2 text-neutral-700">{m.pendiente || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Items title="Fortalezas" items={data.fortalezas} />
        <Items title="Brechas" items={data.brechas} />
        <Items title="Explorar en la entrevista" items={data.explorar_en_entrevista} />
      </div>
    </div>
  );
}
