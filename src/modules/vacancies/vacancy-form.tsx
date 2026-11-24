"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { Field, FormSection, SelectInput, TextArea, TextInput } from "@/components/ui/form";
import { SearchSelect } from "@/components/ui/search-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { EMPLOYMENT_TYPE, PRIORITY, WORK_MODALITY, optionsFrom } from "@/modules/labels";
import { CR_PROVINCES, CURRENCIES, type JobPosition, type Vacancy } from "@/types/database";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Valores iniciales: la vacante (edición) o los datos heredados de la requisición (alta). */
export type VacancyDefaults = Partial<Vacancy> & { requisition_id?: string };

/**
 * Alta y edición de vacantes. Se envía con onSubmit + startTransition para que
 * React 19 no reinicie el formulario.
 */
export function VacancyForm({
  action,
  vacancy,
  defaults,
  requisitions,
  positions,
  users,
  cancelHref,
}: {
  action: Action;
  /** Presente en edición. */
  vacancy?: Vacancy;
  defaults?: VacancyDefaults;
  /** Solo en alta: requisiciones aprobadas o en proceso. */
  requisitions?: Array<{ id: string; code: string; title: string; client: { name: string } | null }>;
  positions: JobPosition[];
  users: Array<{ id: string; full_name: string; email: string }>;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const d: VacancyDefaults = vacancy ?? defaults ?? {};
  const str = (v: unknown) => (v == null ? "" : String(v));
  const err = state.fieldErrors ?? {};

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending} aria-label={vacancy ? "Editar vacante" : "Nueva vacante"}>
      {vacancy ? <input type="hidden" name="id" value={vacancy.id} /> : null}
      {state.error ? (
        <Alert tone="error" className="mb-4">
          {state.error}
        </Alert>
      ) : null}
      <Card>
        <FormSection title="Vacante" description="Puesto publicado a partir de una requisición aprobada.">
          {requisitions ? (
            <Field id="requisition_id" label="Requisición" required error={err.requisition_id} className="sm:col-span-2">
              <SearchSelect
                id="requisition_id"
                name="requisition_id"
                label="Requisición"
                placeholder="Buscar requisición aprobada o en proceso…"
                defaultValue={d.requisition_id}
                options={requisitions.map((r) => ({ value: r.id, label: `${r.code} · ${r.title}`, hint: r.client?.name }))}
                error={err.requisition_id}
              />
            </Field>
          ) : null}
          <Field id="title" label="Título de la vacante" required error={err.title}>
            <TextInput id="title" defaultValue={str(d.title)} required maxLength={200} error={err.title} />
          </Field>
          <Field id="position_id" label="Puesto (catálogo)" error={err.position_id} hint="Define el proceso y los requisitos sugeridos.">
            <SearchSelect
              id="position_id"
              name="position_id"
              label="Puesto (catálogo)"
              placeholder="Buscar puesto…"
              allowCreate
              createLabel="Nuevo puesto"
              defaultValue={d.position_id}
              options={positions.map((p) => ({ value: p.id, label: p.name, hint: p.area, inactive: !p.is_active }))}
              error={err.position_id}
            />
          </Field>
          <Field id="openings" label="Plazas" required error={err.openings}>
            <TextInput id="openings" type="number" min={1} max={500} defaultValue={str(d.openings ?? 1)} error={err.openings} />
          </Field>
          <Field id="employment_type" label="Tipo de contratación" required error={err.employment_type}>
            <SelectInput id="employment_type" defaultValue={str(d.employment_type ?? "tiempo_completo")} options={optionsFrom(EMPLOYMENT_TYPE)} error={err.employment_type} />
          </Field>
          <Field id="description" label="Descripción" error={err.description} className="sm:col-span-2" hint="Funciones y detalles del puesto. No incluya datos personales.">
            <TextArea id="description" defaultValue={str(d.description)} maxLength={5000} rows={5} error={err.description} />
          </Field>
        </FormSection>

        <FormSection title="Condiciones" description="Ubicación, modalidad, horario y salario.">
          <Field id="province" label="Provincia" error={err.province}>
            <SelectInput id="province" defaultValue={str(d.province)} placeholder="Seleccione…" options={CR_PROVINCES.map((p) => ({ value: p, label: p }))} error={err.province} />
          </Field>
          <Field id="location_detail" label="Ubicación (detalle)" error={err.location_detail} hint="Ej.: Zona franca, Heredia centro">
            <TextInput id="location_detail" defaultValue={str(d.location_detail)} maxLength={300} error={err.location_detail} />
          </Field>
          <Field id="modality" label="Modalidad" required error={err.modality}>
            <SelectInput id="modality" defaultValue={str(d.modality ?? "presencial")} options={optionsFrom(WORK_MODALITY)} error={err.modality} />
          </Field>
          <Field id="work_schedule" label="Horario" error={err.work_schedule} hint="Ej.: L-V 8:00 a 17:00">
            <TextInput id="work_schedule" defaultValue={str(d.work_schedule)} maxLength={200} error={err.work_schedule} />
          </Field>
          <Field id="currency" label="Moneda" required error={err.currency}>
            <SelectInput id="currency" defaultValue={str(d.currency ?? "CRC")} options={CURRENCIES.map((c) => ({ value: c, label: c }))} error={err.currency} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="salary_min" label="Salario mínimo" error={err.salary_min}>
              <TextInput id="salary_min" type="number" min={0} step="0.01" defaultValue={str(d.salary_min)} error={err.salary_min} />
            </Field>
            <Field id="salary_max" label="Salario máximo" error={err.salary_max}>
              <TextInput id="salary_max" type="number" min={0} step="0.01" defaultValue={str(d.salary_max)} error={err.salary_max} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Gestión" description="Responsable, prioridad y fecha límite de la vacante.">
          <Field id="recruiter_id" label="Reclutador(a) responsable" error={err.recruiter_id}>
            <SelectInput
              id="recruiter_id"
              defaultValue={str(d.recruiter_id)}
              placeholder="Sin asignar"
              options={users.map((u) => ({ value: u.id, label: u.full_name || u.email }))}
              error={err.recruiter_id}
            />
          </Field>
          <Field id="priority" label="Prioridad" required error={err.priority}>
            <SelectInput id="priority" defaultValue={str(d.priority ?? "media")} options={optionsFrom(PRIORITY)} error={err.priority} />
          </Field>
          <Field id="closes_at" label="Fecha límite" error={err.closes_at}>
            <TextInput id="closes_at" type="date" defaultValue={str(d.closes_at)} error={err.closes_at} />
          </Field>
          {!vacancy ? (
            <div className="space-y-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-ink-950">
                <input type="checkbox" name="load_requirements" defaultChecked className="h-4 w-4 accent-brand-600" />
                Cargar los requisitos sugeridos del cliente y del puesto
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-950">
                <input type="checkbox" name="publish_now" className="h-4 w-4 accent-brand-600" />
                Publicar (abrir) al guardar
              </label>
            </div>
          ) : null}
        </FormSection>

        <div className="flex justify-end gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-4">
          <Link href={cancelHref} className={buttonClasses("secondary")}>
            Cancelar
          </Link>
          <SubmitButton pending={pending}>{vacancy ? "Guardar cambios" : "Crear vacante"}</SubmitButton>
        </div>
      </Card>
    </form>
  );
}
