"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { REQUIREMENT_CATEGORY, optionsFrom } from "@/modules/labels";
import type { RequirementCatalogItem } from "@/types/database";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Edición de un requisito del catálogo. Se envía con onSubmit + startTransition
 * para que React 19 no reinicie el formulario (los valores se conservan si hay errores).
 */
export function RequirementEditForm({
  action,
  item,
  scales,
  scaleLocked,
  cancelHref,
}: {
  action: Action;
  item: RequirementCatalogItem;
  scales: Array<{ id: string; name: string; is_active: boolean }>;
  /** Hay requisitos configurados con nivel mínimo: la escala no se puede cambiar. */
  scaleLocked: boolean;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const err = state.fieldErrors ?? {};
  // Escalas activas, más la actual aunque esté inactiva.
  const scaleOptions = scales.filter((s) => s.is_active || s.id === item.scale_id).map((s) => ({ value: s.id, label: s.is_active ? s.name : `${s.name} (inactiva)` }));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending} aria-label="Editar requisito del catálogo" className="space-y-4 px-5 py-5">
      <input type="hidden" name="id" value={item.id} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert>{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rc-edit-name" label="Nombre del requisito" required error={err.name} className="sm:col-span-2">
          <TextInput id="rc-edit-name" name="name" defaultValue={item.name} maxLength={200} error={err.name} />
        </Field>
        <Field id="rc-edit-category" label="Categoría" required error={err.category}>
          <SelectInput id="rc-edit-category" name="category" defaultValue={item.category} options={optionsFrom(REQUIREMENT_CATEGORY)} error={err.category} />
        </Field>
        <Field
          id="rc-edit-scale"
          label="Escala de dominio"
          error={err.scale_id}
          hint={scaleLocked ? "Bloqueada: hay requisitos configurados con nivel mínimo de esta escala." : "Define los niveles mínimos que se pueden exigir."}
        >
          {scaleLocked ? (
            <>
              {/* Un select deshabilitado no se envía: se conserva el valor actual. */}
              <input type="hidden" name="scale_id" value={item.scale_id ?? ""} />
              <SelectInput id="rc-edit-scale" defaultValue={item.scale_id ?? ""} placeholder="Sin escala" options={scaleOptions} disabled />
            </>
          ) : (
            <SelectInput id="rc-edit-scale" name="scale_id" defaultValue={item.scale_id ?? ""} placeholder="Sin escala" options={scaleOptions} error={err.scale_id} />
          )}
        </Field>
        <Field id="rc-edit-description" label="Descripción" error={err.description} className="sm:col-span-2" hint="Opcional. No incluya datos personales.">
          <TextArea id="rc-edit-description" name="description" defaultValue={item.description ?? ""} maxLength={500} error={err.description} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Link href={cancelHref} className={buttonClasses("secondary")}>
          Volver al catálogo
        </Link>
        <SubmitButton pending={pending}>Guardar cambios</SubmitButton>
      </div>
    </form>
  );
}
