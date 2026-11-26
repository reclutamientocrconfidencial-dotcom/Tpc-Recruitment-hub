"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { AlertTriangle, CalendarClock, Star } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { DISCARD_REASON, STAGE_CATEGORY, optionsFrom } from "@/modules/labels";
import { daysInStage } from "@/modules/applications/filters";
import type { Application, DiscardReason, VacancyStage } from "@/types/database";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface PendingDiscard {
  applicationId: string;
  stageId: string;
  name: string;
}

/**
 * Tablero Kanban por vacante. Mover: arrastrar la tarjeta a otra columna o usar
 * «Mover a…» en la tarjeta (accesible con teclado y en el celular). Al descartar
 * se exige el motivo. La base de datos valida cada movimiento.
 */
export function KanbanBoard({
  vacancyId,
  stages,
  applications,
  canMove,
  action,
}: {
  vacancyId: string;
  stages: VacancyStage[];
  applications: Application[];
  canMove: boolean;
  action: Action;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [discard, setDiscard] = useState<PendingDiscard | null>(null);
  const [reason, setReason] = useState<DiscardReason | "">("");
  const [note, setNote] = useState("");
  const active = stages.filter((s) => s.is_active);
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const nameOf = (a: Application) => `${a.candidate?.first_name ?? ""} ${a.candidate?.last_name ?? ""}`.trim();

  function move(applicationId: string, stageId: string, discardReason?: string, discardNote?: string) {
    const target = stageById.get(stageId);
    const app = applications.find((a) => a.id === applicationId);
    if (!target || !app || app.stage_id === stageId) return;
    if (target.category === "descartado" && !discardReason) {
      setDiscard({ applicationId, stageId, name: nameOf(app) });
      setReason("");
      setNote("");
      return;
    }
    const fd = new FormData();
    fd.set("application_id", applicationId);
    fd.set("stage_id", stageId);
    fd.set("vacancy_id", vacancyId);
    if (discardReason) fd.set("discard_reason", discardReason);
    if (discardNote) fd.set("discard_note", discardNote);
    startTransition(() => formAction(fd));
  }

  return (
    <div>
      {state.error ? <Alert tone="error" className="mb-3">{state.error}</Alert> : null}
      {state.ok && state.message ? (
        <p className="mb-3 text-sm text-emerald-700" role="status">
          {state.message}
        </p>
      ) : null}

      {discard ? (
        <div role="dialog" aria-modal="true" aria-label="Motivo del descarte" className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold">Descartar a {discard.name}</h2>
            <p className="mb-3 text-sm text-neutral-600">El motivo es obligatorio y queda en el historial.</p>
            <label htmlFor="discard_reason" className="block text-sm font-medium">
              Motivo
            </label>
            <select
              id="discard_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as DiscardReason)}
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Seleccione…</option>
              {optionsFrom(DISCARD_REASON).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label htmlFor="discard_note" className="mt-3 block text-sm font-medium">
              Detalle (opcional)
            </label>
            <input id="discard_note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDiscard(null)}>
                Cancelar
              </Button>
              <Button
                disabled={!reason}
                onClick={() => {
                  move(discard.applicationId, discard.stageId, reason, note);
                  setDiscard(null);
                }}
              >
                Descartar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div role="region" className="flex gap-3 overflow-x-auto pb-4" aria-busy={pending} aria-label="Tablero de postulaciones">
        {active.map((stage) => {
          const cards = applications.filter((a) => a.stage_id === stage.id);
          return (
            <section
              key={stage.id}
              aria-label={`Etapa ${stage.name}`}
              onDragOver={(e) => {
                if (!canMove || !dragId) return;
                e.preventDefault();
                setOver(stage.id);
              }}
              onDragLeave={() => setOver((o) => (o === stage.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragId) move(dragId, stage.id);
                setDragId(null);
              }}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-xl border bg-neutral-50 transition-colors",
                over === stage.id ? "border-brand-600 bg-brand-50" : "border-neutral-200",
              )}
            >
              <header className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-ink-950">{stage.name}</h2>
                  <p className="text-xs text-neutral-500">
                    {STAGE_CATEGORY[stage.category].label}
                    {stage.target_days != null ? ` · objetivo ${stage.target_days} d` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink-950" data-testid={`conteo-etapa-${stage.position}`}>
                  {cards.length}
                </span>
              </header>
              <ul className="flex min-h-24 flex-col gap-2 p-2">
                {cards.map((a) => {
                  const days = daysInStage(a.stage_changed_at);
                  const late = stage.target_days != null && days > stage.target_days && !["contratado", "descartado"].includes(stage.category);
                  return (
                    <li
                      key={a.id}
                      draggable={canMove}
                      onDragStart={() => setDragId(a.id)}
                      onDragEnd={() => setDragId(null)}
                      className={cn("rounded-lg border bg-white p-3 shadow-sm", canMove && "cursor-grab", late ? "border-amber-400" : "border-neutral-200")}
                      aria-label={`Postulación de ${nameOf(a)}`}
                    >
                      <Link href={`/postulaciones/${a.id}`} className="text-sm font-semibold text-ink-950 hover:text-brand-600 hover:underline">
                        {nameOf(a)}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                        {a.rating ? (
                          <span className="inline-flex items-center gap-0.5" aria-label={`Calificación ${a.rating} de 5`}>
                            <Star className="h-3 w-3 fill-brand-600 text-brand-600" aria-hidden /> {a.rating}
                          </span>
                        ) : null}
                        <span className={late ? "inline-flex items-center gap-1 font-semibold text-amber-800" : ""}>
                          {late ? <AlertTriangle className="h-3 w-3" aria-hidden /> : null}
                          {days} d en la etapa
                        </span>
                        {a.next_action_at ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" aria-hidden /> {a.next_action_at.split("-").reverse().join("/")}
                          </span>
                        ) : null}
                      </div>
                      {canMove ? (
                        <label className="mt-2 block text-xs text-neutral-600">
                          
                          <select
                            aria-label={`Mover ${nameOf(a)} a`}
                            value=""
                            onChange={(e) => move(a.id, e.target.value)}
                            className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs"
                          >
                            <option value="">Mover a…</option>
                            {active
                              .filter((s) => s.id !== stage.id)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
