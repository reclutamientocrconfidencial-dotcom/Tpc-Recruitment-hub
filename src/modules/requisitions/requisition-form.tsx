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
import { PRIORITY, WORK_MODALITY, optionsFrom } from "@/modules/labels";
import { CR_PROVINCES, CURRENCIES, type JobPosition, type Requisition } from "@/types/database";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Alta y edición de requisiciones. Se envía con onSubmit + startTransition para
 * que React 19 no reinicie el formulario (los valores se conservan si hay errores).
 */
export function RequisitionForm({
  action,
  requisition,
  clients,
  positions,
  users,
  cancelHref,
}: {
  action: Action;
  requisition?: Requisition;
  clients: Array<{ id: string; name: string }>;
  positions: JobPosition[];
  users: Array<{ id: string; full_name: string; email: string }>;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const r = requisition;
  const str = (v: unknown) => (v == null ? "" : String(v));
  const err = state.fieldErrors ?? {};

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending} aria-label={r ? "Editar requisición" : "Nueva requisición"}>
      {r ? <input type="hidden" name="id" value={r.id} /> : null}
      {state.error ? (
        <Alert tone="error" className="mb-4">
          {state.error}
        </Alert>
      ) : null}
      <Card>
        <FormSection title="Solicitud" description="Cliente y puesto solicitados (catálogos existentes).">
          <Field id="client_id" label="Cliente" required error={err.client_id}>
            <SearchSelect
              id="client_id"
              name="client_id"
              label="Cliente"
              placeholder="Buscar cliente…"
              defaultValue={r?.client_id}
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
              error={err.client_id}
            />
          </Field>
          <Field id="position_id" label="Puesto (catálogo)" error={err.position_id} hint="Si no existe, escríbalo y se agregará al catálogo.">
            <SearchSelect
              id="position_id"
              name="position_id"
              label="Puesto (catálogo)"
              placeholder="Buscar puesto…"
              allowCreate
              createLabel="Nuevo puesto"
              defaultValue={r?.position_id}
              options={positions.map((p) => ({ value: p.id, label: p.name, hint: p.area, inactive: !p.is_active }))}
              error={err.position_id}
            />
          </Field>
          <Field id="title" label="Título del puesto solicitado" required error={err.title}>
            <TextInput id="title" defaultValue={str(r?.title)} required maxLength={200} error={err.title} />
          </Field>
          <Field id="department" label="Departamento" error={err.department}>
            <TextInput id="department" defaultValue={str(r?.department)} maxLength={120} error={err.department} />
          </Field>
          <Field id="positions_count" label="Cantidad de plazas" required error={err.positions_count}>
            <TextInput id="positions_count" type="number" min={1} max={500} defaultValue={str(r?.positions_count ?? 1)} error={err.positions_count} />
          </Field>
          <Field id="requested_by_name" label="Solicitado por (cliente)" error={err.requested_by_name} hint="Cargo o área solicitante.">
            <TextInput id="requested_by_name" defaultValue={str(r?.requested_by_name)} maxLength={150} error={err.requested_by_name} />
          </Field>
        </FormSection>

        <FormSection title="Condiciones" description="Ubicación, modalidad, horario y salario ofrecido.">
          <Field id="province" label="Provincia" error={err.province}>
            <SelectInput id="province" defaultValue={str(r?.province)} placeholder="Seleccione…" options={CR_PROVINCES.map((p) => ({ value: p, label: p }))} error={err.province} />
          </Field>
          <Field id="modality" label="Modalidad" error={err.modality}>
            <SelectInput id="modality" defaultValue={str(r?.modality)} placeholder="Seleccione…" options={optionsFrom(WORK_MODALITY)} error={err.modality} />
          </Field>
          <Field id="work_schedule" label="Horario" error={err.work_schedule} hint="Ej.: L-V 8:00 a 17:00">
            <TextInput id="work_schedule" defaultValue={str(r?.work_schedule)} maxLength={200} error={err.work_schedule} />
          </Field>
          <Field id="currency" label="Moneda" required error={err.currency}>
            <SelectInput id="currency" defaultValue={str(r?.currency ?? "CRC")} options={CURRENCIES.map((c) => ({ value: c, label: c }))} error={err.currency} />
          </Field>
          <Field id="salary_min" label="Salario mínimo" error={err.salary_min}>
            <TextInput id="salary_min" type="number" min={0} step="0.01" defaultValue={str(r?.salary_min)} error={err.salary_min} />
          </Field>
          <Field id="salary_max" label="Salario máximo" error={err.salary_max}>
            <TextInput id="salary_max" type="number" min={0} step="0.01" defaultValue={str(r?.salary_max)} error={err.salary_max} />
          </Field>
        </FormSection>

        <FormSection title="Gestión" description="Responsable, prioridad y fecha límite.">
          <Field id="assigned_recruiter_id" label="Responsable" error={err.assigned_recruiter_id}>
            <SelectInput
              id="assigned_recruiter_id"
              defaultValue={str(r?.assigned_recruiter_id)}
              placeholder="Sin asignar"
              options={users.map((u) => ({ value: u.id, label: u.full_name || u.email }))}
              error={err.assigned_recruiter_id}
            />
          </Field>
          <Field id="priority" label="Prioridad" required error={err.priority}>
            <SelectInput id="priority" defaultValue={str(r?.priority ?? "media")} options={optionsFrom(PRIORITY)} error={err.priority} />
          </Field>
          <Field id="target_date" label="Fecha límite" error={err.target_date}>
            <TextInput id="target_date" type="date" defaultValue={str(r?.target_date)} error={err.target_date} />
          </Field>
          <Field id="justification" label="Justificación" error={err.justification} className="sm:col-span-2" hint="No registre datos personales.">
            <TextArea id="justification" defaultValue={str(r?.justification)} maxLength={2000} error={err.justification} />
          </Field>
          {!r ? (
            <label className="flex items-center gap-2 text-sm text-ink-950 sm:col-span-2">
              <input type="checkbox" name="submit_for_approval" className="h-4 w-4 accent-brand-600" />
              Enviar a aprobación al guardar
            </label>
          ) : null}
        </FormSection>

        <div className="flex justify-end gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-4">
          <Link href={cancelHref} className={buttonClasses("secondary")}>
            Cancelar
          </Link>
          <SubmitButton pending={pending}>{r ? "Guardar cambios" : "Crear requisición"}</SubmitButton>
        </div>
      </Card>
    </form>
  );
}
