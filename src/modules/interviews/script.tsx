"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { InlineAction } from "@/modules/common/inline-action";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import type { InterviewAnswer } from "@/types/database";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;
const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const ORIGIN: Record<string, string> = { banco: "Banco", ia: "Propuesta IA revisada", manual: "Manual" };

function QuestionForm({ action, interviewId, q, onDone }: { action: Action; interviewId: string; q?: InterviewAnswer; onDone?: () => void }) {
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    if (r.ok) onDone?.();
    return r;
  }, INITIAL_ACTION_STATE);
  const k = q ? `q${q.position}` : "new";
  return (
    <form action={formAction} className="space-y-2" aria-label={q ? `Editar pregunta ${q.position}` : "Agregar pregunta"}>
      <input type="hidden" name="interview_id" value={interviewId} />
      {q ? <input type="hidden" name="position" value={q.position} /> : null}
      <label htmlFor={`${k}-text`} className="block text-sm font-medium">Pregunta</label>
      <textarea id={`${k}-text`} name="text" rows={2} maxLength={500} required defaultValue={q?.question_text ?? ""} className={input} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor={`${k}-comp`} className="block text-sm font-medium">Competencia evaluada</label>
          <input id={`${k}-comp`} name="competency" maxLength={80} defaultValue={q?.competency ?? ""} className={input} placeholder="p. ej. Orientación a resultados" />
        </div>
        <div>
          <label htmlFor={`${k}-obj`} className="block text-sm font-medium">Objetivo</label>
          <input id={`${k}-obj`} name="objective" maxLength={300} defaultValue={q?.objective ?? ""} className={input} placeholder="Qué evidencia se busca" />
        </div>
      </div>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok && state.message ? <p className="text-sm text-emerald-700" role="status">{state.message}</p> : null}
      <SubmitButton variant="secondary">{q ? "Guardar pregunta" : "Agregar pregunta"}</SubmitButton>
    </form>
  );
}

/** Guion editable: agregar, editar y quitar preguntas mientras la entrevista está programada. */
export function InterviewScript({ interviewId, answers, save, remove }: { interviewId: string; answers: InterviewAnswer[]; save: Action; remove: Action }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-3">
      <ol className="space-y-2" aria-label="Preguntas del guion">
        {answers.map((a) => (
          <li key={a.position} className="rounded-lg border border-neutral-200 p-3 text-sm">
            {editing === a.position ? (
              <QuestionForm action={save} interviewId={interviewId} q={a} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{a.position}. {a.question_text}</p>
                  <p className="text-xs text-neutral-500">
                    {[a.competency, a.objective, a.origin ? ORIGIN[a.origin] : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="flex gap-1">
                  <Button type="button" variant="ghost" onClick={() => setEditing(a.position)} aria-label={`Editar pregunta ${a.position}`}>
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <InlineAction action={remove} fields={{ interview_id: interviewId, position: String(a.position) }} label="Quitar" variant="ghost" confirmText="¿Quitar esta pregunta del guion?" />
                </span>
              </div>
            )}
          </li>
        ))}
        {answers.length === 0 ? <li className="text-sm text-neutral-500">El guion está vacío.</li> : null}
      </ol>
      {adding ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-3">
          <QuestionForm action={save} interviewId={interviewId} onDone={() => setAdding(false)} />
        </div>
      ) : (
        <Button type="button" variant="ghost" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Agregar pregunta
        </Button>
      )}
    </div>
  );
}

/** Propuesta de preguntas de la IA: el reclutador marca cuáles agregar. */
export function QuestionProposal({ action, requestId, interviewId, items }: { action: Action; requestId: string; interviewId: string; items: Array<{ texto: string; competencia: string; objetivo: string; fundamento: string }> }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  return (
    <form action={formAction} className="space-y-2" aria-label="Propuesta de preguntas">
      <input type="hidden" name="id" value={requestId} />
      <input type="hidden" name="interview_id" value={interviewId} />
      <ul className="space-y-2">
        {items.map((q, i) => (
          <li key={i}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={`q_${i}`} defaultChecked className="mt-1" />
              <span>
                <span className="font-medium">{q.texto}</span>
                <span className="block text-xs text-neutral-500">{q.competencia} · {q.objetivo}{q.fundamento ? ` · Fundamento: ${q.fundamento}` : ""}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok && state.message ? <p className="text-sm text-emerald-700" role="status">{state.message}</p> : null}
      <SubmitButton variant="secondary" pendingText="Agregando…">Agregar las marcadas al guion</SubmitButton>
    </form>
  );
}
