import { Download } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { RECOMMENDATION } from "@/modules/labels";
import type { Recommendation } from "@/types/database";

/** Selección de 2 a 6 candidatos con informe final para el comparativo de terna (formulario GET, sin JavaScript). */
export function TernaCard({ vacancyId, items }: { vacancyId: string; items: Array<{ application_id: string; candidate: string; recommendation: string | null }> }) {
  return (
    <Card className="mt-6">
      <CardHeader title="Informe comparativo de terna" description="Seleccione de 2 a 6 candidatos con informe final. Cada exportación queda registrada." />
      {items.length < 2 ? (
        <p className="px-5 py-4 text-sm text-neutral-500">Se necesitan al menos dos informes finales en esta vacante.</p>
      ) : (
        <form method="get" action={`/api/ternas/${vacancyId}/pdf`} className="space-y-3 px-5 py-4">
          <fieldset>
            <legend className="sr-only">Candidatos de la terna</legend>
            <ul className="grid gap-2 sm:grid-cols-2">
              {items.map((x) => (
                <li key={x.application_id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="ids" value={x.application_id} />
                    <span className="font-medium">{x.candidate}</span>
                    {x.recommendation ? <span className="text-xs text-neutral-500">· {RECOMMENDATION[x.recommendation as Recommendation]?.label}</span> : null}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonClasses("dark")}>
              <Download className="h-4 w-4" aria-hidden /> PDF
            </button>
            <button type="submit" formAction={`/api/ternas/${vacancyId}/docx`} className={buttonClasses("dark")}>
              <Download className="h-4 w-4" aria-hidden /> Word (.docx)
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
