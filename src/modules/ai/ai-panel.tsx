import { Sparkles } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InlineAction } from "@/modules/common/inline-action";
import { AI_FEATURE_LABEL, type AiFeature } from "@/lib/ai/features";
import { addAiQuestionsAction, applyReportDraftAction, reviewAiAction, runAiAction } from "@/modules/ai/actions";
import { AiRunForm } from "@/modules/ai/run-form";
import type { AiRequestRow, AiSettings } from "@/modules/ai/repository";
import type { LabelDef } from "@/modules/labels";

const STATUS: Record<AiRequestRow["status"], LabelDef> = {
  en_proceso: { label: "En proceso", tone: "muted" },
  pendiente_revision: { label: "Pendiente de revisión", tone: "warning" },
  aceptado: { label: "Aceptado por una persona", tone: "success" },
  descartado: { label: "Descartado", tone: "muted" },
  error: { label: "Error", tone: "red" },
};

const DATE = new Intl.DateTimeFormat("es-CR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Costa_Rica" });

function List({ items }: { items: unknown }) {
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return <span className="text-neutral-500">—</span>;
  return (
    <ul className="list-disc pl-5">
      {arr.map((x, i) => (
        <li key={i}>{typeof x === "string" ? x : JSON.stringify(x)}</li>
      ))}
    </ul>
  );
}

/** Muestra el resultado según la función (texto plano; React escapa todo). */
function Output({ feature, output }: { feature: AiFeature; output: Record<string, unknown> }) {
  const o = output as Record<string, unknown>;
  switch (feature) {
    case "extraer_cv":
      return (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2"><dt className="font-semibold">Resumen</dt><dd>{String(o.resumen ?? "")}</dd></div>
          <div><dt className="font-semibold">Puesto actual</dt><dd>{String(o.puesto_actual ?? "—")}</dd></div>
          <div><dt className="font-semibold">Años de experiencia</dt><dd>{String(o.anios_experiencia ?? "—")}</dd></div>
          <div><dt className="font-semibold">Habilidades</dt><dd><List items={o.habilidades} /></dd></div>
          <div><dt className="font-semibold">Idiomas</dt><dd><List items={(o.idiomas as Array<{ idioma: string; nivel: string }> | undefined)?.map((x) => `${x.idioma}: ${x.nivel}`)} /></dd></div>
          <div className="sm:col-span-2"><dt className="font-semibold">Formación</dt><dd><List items={o.formacion} /></dd></div>
        </dl>
      );
    case "comparar":
      return (
        <div className="space-y-2 text-sm">
          <p><strong>Afinidad estimada: {String(o.puntaje)} / 100.</strong> {String(o.resumen ?? "")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><p className="font-semibold">Fortalezas</p><List items={o.fortalezas} /></div>
            <div><p className="font-semibold">Brechas</p><List items={o.brechas} /></div>
            <div><p className="font-semibold">Verificar en entrevista</p><List items={o.verificar_en_entrevista} /></div>
          </div>
        </div>
      );
    case "preguntas":
      return <List items={(o.preguntas as Array<{ texto: string; que_observar: string }> | undefined)?.map((q) => `${q.texto} — Observar: ${q.que_observar}`)} />;
    case "borrador_informe":
      return <List items={(o.secciones as Array<{ clave: string; texto: string }> | undefined)?.map((s) => `${s.clave}: ${s.texto}`)} />;
    case "publicacion":
      return (
        <div className="space-y-1 text-sm">
          <p className="font-semibold">{String(o.titulo ?? "")}</p>
          <p className="whitespace-pre-line">{String(o.texto ?? "")}</p>
          <p className="text-neutral-600">{((o.etiquetas as string[] | undefined) ?? []).join(" ")}</p>
        </div>
      );
  }
}

export function AiPanel({
  settings,
  requests,
  runs,
  path,
  canManageCatalog = false,
}: {
  settings: AiSettings | null;
  requests: AiRequestRow[];
  runs: Array<{ feature: AiFeature; label: string; fields: Record<string, string>; withText?: boolean }>;
  path: string;
  canManageCatalog?: boolean;
}) {
  const enabled = Boolean(settings?.enabled);
  return (
    <Card className="mt-6">
      <CardHeader
        title="Asistente de IA"
        description={
          enabled
            ? `Proveedor: ${settings!.provider === "simulado" ? "simulado (sin enviar datos a terceros)" : `${settings!.provider} · ${settings!.model}`}. Datos mínimos y seudonimizados; todo resultado requiere revisión humana.`
            : "Desactivado. Administración puede activarlo en Administración → Inteligencia artificial."
        }
        action={<Sparkles className="h-5 w-5 text-brand-600" aria-hidden />}
      />
      {enabled ? (
        <div className="flex flex-wrap items-start gap-4 border-b border-neutral-100 px-5 py-4">
          {runs.map((r) => (
            <div key={r.feature} className={r.withText ? "w-full" : ""}>
              <AiRunForm action={runAiAction} fields={{ feature: r.feature, ...r.fields, path }} label={r.label} withText={r.withText} />
            </div>
          ))}
        </div>
      ) : null}
      {requests.length === 0 ? (
        <p className="px-5 py-4 text-sm text-neutral-500">Sin consultas de IA.</p>
      ) : (
        <ul className="divide-y divide-neutral-100" aria-label="Resultados de IA">
          {requests.map((r) => (
            <li key={r.id} className="space-y-2 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{AI_FEATURE_LABEL[r.feature]}</span>
                <Badge def={STATUS[r.status]} />
                <span className="text-xs text-neutral-500">
                  {DATE.format(new Date(r.created_at))} · {r.user?.full_name ?? "—"} · {r.model}
                  {r.input_tokens != null ? ` · ${r.input_tokens + (r.output_tokens ?? 0)} tokens` : ""} · US$ {Number(r.cost_usd).toFixed(4)}
                  {r.pseudonymized ? " · seudonimizado" : ""}
                  {r.reviewer?.full_name ? ` · revisado por ${r.reviewer.full_name}` : ""}
                </span>
              </div>
              {r.status === "error" ? <p className="text-sm text-brand-700">{r.error}</p> : null}
              {r.output ? (
                <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">Generado por IA · verifique antes de usar</p>
                  <Output feature={r.feature} output={r.output} />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {r.status === "pendiente_revision" ? (
                  <>
                    <InlineAction action={reviewAiAction} fields={{ id: r.id, decision: "aceptado", path }} label="Aceptar" variant="dark" />
                    <InlineAction action={reviewAiAction} fields={{ id: r.id, decision: "descartado", path }} label="Descartar" variant="ghost" />
                  </>
                ) : null}
                {r.status === "aceptado" && r.feature === "borrador_informe" ? (
                  <InlineAction action={applyReportDraftAction} fields={{ id: r.id }} label="Completar secciones vacías del informe" variant="secondary" />
                ) : null}
                {r.status === "aceptado" && r.feature === "preguntas" && canManageCatalog ? (
                  <InlineAction action={addAiQuestionsAction} fields={{ id: r.id }} label="Agregar al banco de preguntas" variant="secondary" />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
