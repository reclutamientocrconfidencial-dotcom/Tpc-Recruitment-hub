"use client";

import { startTransition, useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import type { CvProfile } from "@/lib/cv/profile";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type Job = CvProfile["experiencia"][number];

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "Sin indicar"];
const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:bg-neutral-50";
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function L({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-ink-950">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-neutral-100 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="text-sm font-bold uppercase tracking-wide text-ink-950">{title}</legend>
        {action}
      </div>
      {children}
    </fieldset>
  );
}

/**
 * Editor del perfil curricular: el reclutador revisa, corrige y confirma lo
 * extraído antes de incorporarlo a la ficha. Nada se guarda en la ficha sin
 * su confirmación expresa.
 */
export function CvProfileEditor({ id, candidateId, initial, readOnly, action }: { id: string; candidateId: string; initial: CvProfile; readOnly: boolean; action: Action }) {
  const [p, setP] = useState<CvProfile>(initial);
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const set = <K extends keyof CvProfile>(k: K, v: CvProfile[K]) => setP((x) => ({ ...x, [k]: v }));
  const setJob = (i: number, patch: Partial<Job>) => set("experiencia", p.experiencia.map((j, k) => (k === i ? { ...j, ...patch } : j)));
  const ro = readOnly;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) fd.set(submitter.name, submitter.value);
    if (fd.get("intent") === "confirmar" && !window.confirm("¿Confirmar el perfil? Quedará como versión oficial y no podrá modificarse (para cambiarlo se hace una nueva lectura).")) return;
    fd.set("data", JSON.stringify(p));
    startTransition(() => formAction(fd));
  };

  return (
    <form onSubmit={onSubmit} aria-label="Revisión del perfil curricular">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="candidate_id" value={candidateId} />

      <Section title="Resumen">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <L id="cv-puesto" label="Puesto actual o más reciente">
              <input id="cv-puesto" className={input} value={p.puesto_actual} maxLength={150} disabled={ro} onChange={(e) => set("puesto_actual", e.target.value)} />
            </L>
          </div>
          <L id="cv-anios" label="Años de experiencia total" hint="Calculado sin contar dos veces períodos superpuestos.">
            <input id="cv-anios" type="number" min={0} max={70} step={0.1} className={input} value={p.anios_experiencia} disabled={ro} onChange={(e) => set("anios_experiencia", Number(e.target.value) || 0)} />
          </L>
        </div>
        <L id="cv-resumen" label="Resumen profesional">
          <textarea id="cv-resumen" rows={3} className={input} value={p.resumen} maxLength={2000} disabled={ro} onChange={(e) => set("resumen", e.target.value)} />
        </L>
        <L id="cv-especifica" label="Experiencia específica relevante" hint="Experiencia directamente relacionada con el tipo de puesto (opcional).">
          <textarea id="cv-especifica" rows={2} className={input} value={p.experiencia_especifica} maxLength={1000} disabled={ro} onChange={(e) => set("experiencia_especifica", e.target.value)} />
        </L>
      </Section>

      <Section
        title={`Trayectoria laboral (${p.experiencia.length})`}
        action={!ro ? <Button type="button" variant="ghost" onClick={() => set("experiencia", [...p.experiencia, { cargo: "", empresa: "", desde: "", hasta: "", funciones: [], logros: [] }])}><Plus className="h-4 w-4" aria-hidden /> Agregar puesto</Button> : null}
      >
        {p.experiencia.length === 0 ? <p className="text-sm text-neutral-500">Sin puestos registrados.</p> : null}
        {p.experiencia.map((j, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-neutral-200 p-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <L id={`cv-cargo-${i}`} label="Cargo">
                  <input id={`cv-cargo-${i}`} className={input} value={j.cargo} maxLength={150} disabled={ro} onChange={(e) => setJob(i, { cargo: e.target.value })} />
                </L>
              </div>
              <div className="sm:col-span-2">
                <L id={`cv-empresa-${i}`} label="Empresa">
                  <input id={`cv-empresa-${i}`} className={input} value={j.empresa} maxLength={150} disabled={ro} onChange={(e) => setJob(i, { empresa: e.target.value })} />
                </L>
              </div>
              <L id={`cv-desde-${i}`} label="Desde">
                <input id={`cv-desde-${i}`} className={input} value={j.desde} maxLength={30} placeholder="Ene 2020" disabled={ro} onChange={(e) => setJob(i, { desde: e.target.value })} />
              </L>
              <L id={`cv-hasta-${i}`} label="Hasta">
                <input id={`cv-hasta-${i}`} className={input} value={j.hasta} maxLength={30} placeholder="Actualidad" disabled={ro} onChange={(e) => setJob(i, { hasta: e.target.value })} />
              </L>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <L id={`cv-funciones-${i}`} label="Funciones y responsabilidades" hint="Una por línea.">
                <textarea id={`cv-funciones-${i}`} rows={4} className={input} defaultValue={j.funciones.join("\n")} disabled={ro} onBlur={(e) => setJob(i, { funciones: lines(e.target.value) })} />
              </L>
              <L id={`cv-logros-${i}`} label="Logros" hint="Una por línea; idealmente medibles.">
                <textarea id={`cv-logros-${i}`} rows={4} className={input} defaultValue={j.logros.join("\n")} disabled={ro} onBlur={(e) => setJob(i, { logros: lines(e.target.value) })} />
              </L>
            </div>
            {!ro ? (
              <Button type="button" variant="ghost" onClick={() => set("experiencia", p.experiencia.filter((_, k) => k !== i))}>
                <Trash2 className="h-4 w-4" aria-hidden /> Quitar puesto
              </Button>
            ) : null}
          </div>
        ))}
      </Section>

      <Section
        title={`Formación académica (${p.formacion.length})`}
        action={!ro ? <Button type="button" variant="ghost" onClick={() => set("formacion", [...p.formacion, { titulo: "", institucion: "", periodo: "" }])}><Plus className="h-4 w-4" aria-hidden /> Agregar</Button> : null}
      >
        {p.formacion.length === 0 ? <p className="text-sm text-neutral-500">Sin formación registrada.</p> : null}
        {p.formacion.map((f, i) => (
          <div key={i} className="grid items-end gap-3 sm:grid-cols-[2fr_2fr_1fr_auto]">
            <L id={`cv-titulo-${i}`} label="Título o grado">
              <input id={`cv-titulo-${i}`} className={input} value={f.titulo} maxLength={200} disabled={ro} onChange={(e) => set("formacion", p.formacion.map((x, k) => (k === i ? { ...x, titulo: e.target.value } : x)))} />
            </L>
            <L id={`cv-inst-${i}`} label="Institución">
              <input id={`cv-inst-${i}`} className={input} value={f.institucion} maxLength={200} disabled={ro} onChange={(e) => set("formacion", p.formacion.map((x, k) => (k === i ? { ...x, institucion: e.target.value } : x)))} />
            </L>
            <L id={`cv-periodo-${i}`} label="Período">
              <input id={`cv-periodo-${i}`} className={input} value={f.periodo} maxLength={60} disabled={ro} onChange={(e) => set("formacion", p.formacion.map((x, k) => (k === i ? { ...x, periodo: e.target.value } : x)))} />
            </L>
            {!ro ? (
              <Button type="button" variant="ghost" aria-label={`Quitar formación ${i + 1}`} onClick={() => set("formacion", p.formacion.filter((_, k) => k !== i))}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        ))}
      </Section>

      <Section
        title="Idiomas"
        action={!ro ? <Button type="button" variant="ghost" onClick={() => set("idiomas", [...p.idiomas, { idioma: "", nivel: "Sin indicar" }])}><Plus className="h-4 w-4" aria-hidden /> Agregar</Button> : null}
      >
        {p.idiomas.length === 0 ? <p className="text-sm text-neutral-500">Sin idiomas registrados.</p> : null}
        {p.idiomas.map((l, i) => (
          <div key={i} className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_auto]">
            <L id={`cv-idioma-${i}`} label="Idioma">
              <input id={`cv-idioma-${i}`} className={input} value={l.idioma} maxLength={40} disabled={ro} onChange={(e) => set("idiomas", p.idiomas.map((x, k) => (k === i ? { ...x, idioma: e.target.value } : x)))} />
            </L>
            <L id={`cv-nivel-${i}`} label="Nivel (MCER)">
              <select id={`cv-nivel-${i}`} className={input} value={LEVELS.includes(l.nivel) ? l.nivel : "Sin indicar"} disabled={ro} onChange={(e) => set("idiomas", p.idiomas.map((x, k) => (k === i ? { ...x, nivel: e.target.value } : x)))}>
                {LEVELS.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </L>
            {!ro ? (
              <Button type="button" variant="ghost" aria-label={`Quitar idioma ${i + 1}`} onClick={() => set("idiomas", p.idiomas.filter((_, k) => k !== i))}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        ))}
      </Section>

      <Section title="Habilidades, certificaciones y licencias">
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["habilidades", "Habilidades técnicas"],
              ["conocimientos", "Conocimientos especializados"],
              ["certificaciones", "Certificaciones y cursos"],
              ["licencias", "Licencias (conducir, montacargas…)"],
            ] as const
          ).map(([k, label]) => (
            <L key={k} id={`cv-${k}`} label={label} hint="Una por línea.">
              <textarea id={`cv-${k}`} rows={4} className={input} defaultValue={p[k].join("\n")} disabled={ro} onBlur={(e) => set(k, lines(e.target.value))} />
            </L>
          ))}
        </div>
      </Section>

      {state.ok && state.message ? (
        <p className="border-t border-neutral-100 px-5 py-3 text-sm text-emerald-700" role="status">
          {state.message}
        </p>
      ) : null}
      {!ro ? (
        <div className="space-y-3 border-t border-neutral-100 px-5 py-4">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="update_candidate" defaultChecked className="mt-1" />
            <span>Al confirmar, actualizar en la ficha el puesto actual, los años de experiencia y el nivel de inglés (no se tocan datos de contacto).</span>
          </label>
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="guardar" variant="secondary" disabled={pending} aria-busy={pending}>
              {pending ? "Procesando…" : "Guardar borrador"}
            </Button>
            <Button type="submit" name="intent" value="confirmar" disabled={pending} aria-busy={pending}>
              Confirmar e incorporar a la ficha
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
