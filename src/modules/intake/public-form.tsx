"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, TextInput } from "@/components/ui/form";
import { CR_PROVINCES, type PublicFormView } from "@/types/database";
import type { ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;
const CONTROL =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-ink-950 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-brand-600";

/**
 * Formulario público de postulación. Envío con onSubmit + startTransition para
 * que React 19 no borre lo escrito si hay errores de validación.
 */
export function PublicApplicationForm({ action, code, form, startedAt }: { action: Action; code: string; form: PublicFormView; startedAt: number }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [province, setProvince] = useState("");
  const cantons = useMemo(() => (form.cantons ?? []).filter((c) => c.province === province), [form.cantons, province]);
  const e = state.fieldErrors ?? {};

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    startTransition(() => formAction(fd));
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending} aria-label="Formulario de postulación" className="space-y-8">
      {state.error ? (
        <Alert tone="error" title="No se pudo enviar">
          {state.error}
        </Alert>
      ) : null}
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="started_at" value={startedAt} />
      <input type="hidden" name="consent_text_id" value={form.consent?.id ?? ""} />
      {/* Campo trampa para robots: oculto a las personas y a los lectores de pantalla. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Sitio web</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-base font-semibold text-ink-950">Sus datos</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="first_name" label="Nombre" required error={e.first_name}>
            <TextInput id="first_name" autoComplete="given-name" maxLength={100} required error={e.first_name} />
          </Field>
          <Field id="last_name" label="Apellidos" required error={e.last_name}>
            <TextInput id="last_name" autoComplete="family-name" maxLength={150} required error={e.last_name} />
          </Field>
          <Field id="email" label="Correo electrónico" error={e.email} hint="Indique al menos correo o teléfono.">
            <TextInput id="email" type="email" autoComplete="email" maxLength={200} error={e.email} hint="Indique al menos correo o teléfono." />
          </Field>
          <Field id="phone" label="Teléfono" error={e.phone}>
            <TextInput id="phone" type="tel" autoComplete="tel" maxLength={30} placeholder="8888-8888" error={e.phone} />
          </Field>
          <Field id="national_id" label="Cédula o identificación (opcional)" error={e.national_id}>
            <TextInput id="national_id" maxLength={30} error={e.national_id} />
          </Field>
          <Field id="current_title" label="Ocupación actual (opcional)" error={e.current_title}>
            <TextInput id="current_title" maxLength={150} error={e.current_title} />
          </Field>
          <Field id="province" label="Provincia" error={e.province}>
            <select id="province" name="province" value={province} onChange={(ev) => setProvince(ev.target.value)} className={CONTROL}>
              <option value="">Seleccione…</option>
              {CR_PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field id="canton" label="Cantón" error={e.canton}>
            <select id="canton" name="canton" defaultValue="" disabled={!province} className={CONTROL}>
              <option value="">{province ? "Seleccione…" : "Elija primero la provincia"}</option>
              {cantons.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="district" label="Distrito (opcional)" error={e.district}>
            <TextInput id="district" maxLength={100} error={e.district} />
          </Field>
          <Field id="years_experience" label="Años de experiencia (opcional)" error={e.years_experience}>
            <TextInput id="years_experience" inputMode="decimal" maxLength={4} error={e.years_experience} />
          </Field>
          {form.positions && form.positions.length > 0 ? (
            <Field id="position_id" label="Puesto de interés" className="sm:col-span-2" error={e.position_id}>
              <select id="position_id" name="position_id" defaultValue="" className={CONTROL}>
                <option value="">Seleccione…</option>
                {form.positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
      </fieldset>

      {form.questions && form.questions.length > 0 ? (
        <fieldset className="space-y-4">
          <legend className="mb-2 text-base font-semibold text-ink-950">Preguntas</legend>
          {form.questions.map((q) => {
            const name = `q_${q.id}`;
            const err = e[name];
            const label = `${q.label}${q.required ? "" : " (opcional)"}`;
            if (q.kind === "si_no" || q.kind === "opcion") {
              const opts = q.kind === "si_no" ? [{ v: "si", l: "Sí" }, { v: "no", l: "No" }] : q.options.map((o) => ({ v: o, l: o }));
              return (
                <fieldset key={q.id} aria-describedby={err ? `${name}-error` : undefined}>
                  <legend className="mb-1.5 text-sm font-medium text-ink-950">
                    {label}
                    {q.required ? <span className="ml-0.5 text-brand-600" aria-hidden>*</span> : null}
                  </legend>
                  <div className="flex flex-wrap gap-4">
                    {opts.map((o) => (
                      <label key={o.v} className="flex items-center gap-2 text-sm">
                        <input type="radio" name={name} value={o.v} className="h-4 w-4 accent-brand-600" />
                        {o.l}
                      </label>
                    ))}
                  </div>
                  {err ? <p id={`${name}-error`} className="mt-1 text-xs text-brand-700">{err}</p> : null}
                </fieldset>
              );
            }
            return (
              <Field key={q.id} id={name} label={label} required={q.required} error={err}>
                {q.kind === "numero" ? (
                  <TextInput id={name} inputMode="decimal" maxLength={9} error={err} />
                ) : (
                  <textarea id={name} name={name} rows={2} maxLength={1000} className={CONTROL} aria-invalid={Boolean(err)} />
                )}
              </Field>
            );
          })}
        </fieldset>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-base font-semibold text-ink-950">Currículum</legend>
        <Field id="cv" label={form.require_cv ? "Adjunte su currículum" : "Adjunte su currículum (opcional)"} required={form.require_cv} error={e.cv} hint="PDF o Word (.docx), máximo 5 MB.">
          <input
            id="cv"
            name="cv"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            aria-invalid={Boolean(e.cv)}
            aria-describedby={e.cv ? "cv-error" : "cv-hint"}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink-950 file:px-3 file:py-2 file:text-white"
          />
        </Field>
      </fieldset>

      {form.consent ? (
        <fieldset className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <legend className="px-1 text-base font-semibold text-ink-950">{form.consent.title}</legend>
          <div className="max-h-56 overflow-y-auto whitespace-pre-line text-sm text-neutral-700" tabIndex={0} aria-label="Texto del consentimiento informado">
            {form.consent.body}
          </div>
          <p className="mt-2 text-xs text-neutral-500">Versión {form.consent.version}</p>
          <label className="mt-3 flex items-start gap-2 text-sm font-medium text-ink-950">
            <input type="checkbox" name="consent" className="mt-0.5 h-4 w-4 accent-brand-600" aria-invalid={Boolean(e.consent)} />
            He leído y acepto el consentimiento informado para el tratamiento de mis datos personales.
          </label>
          {e.consent ? <p className="mt-1 text-xs text-brand-700">{e.consent}</p> : null}
        </fieldset>
      ) : (
        <Alert tone="error">El formulario no tiene un consentimiento vigente y no puede recibir postulaciones.</Alert>
      )}

      <SubmitButton pending={pending} pendingText="Enviando…" disabled={!form.consent} className="w-full sm:w-auto">
        Enviar postulación
      </SubmitButton>
    </form>
  );
}
