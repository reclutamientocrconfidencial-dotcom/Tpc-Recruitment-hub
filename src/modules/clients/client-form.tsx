"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { Field, FormSection, SelectInput, TextArea, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import { CLIENT_STATUS, optionsFrom } from "@/modules/labels";
import { CR_PROVINCES, type Client } from "@/types/database";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function ClientForm({
  action,
  client,
  managers,
  cancelHref,
}: {
  action: Action;
  client?: Client;
  managers: Array<{ id: string; full_name: string; email: string }>;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const v = (key: keyof Client & string, fallback = "") =>
    state.values?.[key] ?? (client && client[key] != null ? String(client[key]) : fallback);
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate>
      {client ? <input type="hidden" name="id" value={client.id} /> : null}
      {state.error ? (
        <Alert tone="error" className="mb-4">
          {state.error}
        </Alert>
      ) : null}
      <Card>
        <FormSection title="Empresa" description="Datos legales y de clasificación del cliente.">
          <Field id="name" label="Nombre de la empresa" required error={err.name} className="sm:col-span-2">
            <TextInput id="name" defaultValue={v("name")} required maxLength={200} error={err.name} autoComplete="organization" />
          </Field>
          <Field id="legal_id" label="Cédula jurídica" error={err.legal_id} hint="Formato: 3-101-123456">
            <TextInput id="legal_id" defaultValue={v("legal_id")} maxLength={30} error={err.legal_id} hint="Formato: 3-101-123456" />
          </Field>
          <Field id="industry" label="Industria" error={err.industry}>
            <TextInput id="industry" defaultValue={v("industry")} maxLength={100} error={err.industry} />
          </Field>
          <Field id="status" label="Estado" required error={err.status}>
            <SelectInput id="status" defaultValue={v("status", "prospecto")} options={optionsFrom(CLIENT_STATUS)} error={err.status} />
          </Field>
          <Field id="account_manager_id" label="Gestor de cuenta" error={err.account_manager_id}>
            <SelectInput
              id="account_manager_id"
              defaultValue={v("account_manager_id")}
              placeholder="Sin asignar"
              options={managers.map((m) => ({ value: m.id, label: m.full_name || m.email }))}
              error={err.account_manager_id}
            />
          </Field>
        </FormSection>

        <FormSection title="Contacto" description="Persona de contacto en la empresa cliente.">
          <Field id="contact_name" label="Nombre del contacto" error={err.contact_name}>
            <TextInput id="contact_name" defaultValue={v("contact_name")} maxLength={150} error={err.contact_name} />
          </Field>
          <Field id="contact_email" label="Correo del contacto" error={err.contact_email}>
            <TextInput id="contact_email" type="email" defaultValue={v("contact_email")} maxLength={200} error={err.contact_email} />
          </Field>
          <Field id="contact_phone" label="Teléfono del contacto" error={err.contact_phone} hint="Ej.: 2222-3333">
            <TextInput id="contact_phone" type="tel" defaultValue={v("contact_phone")} maxLength={30} error={err.contact_phone} hint="Ej.: 2222-3333" />
          </Field>
        </FormSection>

        <FormSection title="Ubicación y notas">
          <Field id="province" label="Provincia" error={err.province}>
            <SelectInput
              id="province"
              defaultValue={v("province")}
              placeholder="Seleccione…"
              options={CR_PROVINCES.map((p) => ({ value: p, label: p }))}
              error={err.province}
            />
          </Field>
          <Field id="address" label="Dirección" error={err.address}>
            <TextInput id="address" defaultValue={v("address")} maxLength={300} error={err.address} />
          </Field>
          <Field id="notes" label="Observaciones internas" error={err.notes} className="sm:col-span-2" hint="No registre aquí datos personales sensibles.">
            <TextArea id="notes" defaultValue={v("notes")} maxLength={2000} error={err.notes} hint="No registre aquí datos personales sensibles." />
          </Field>
        </FormSection>

        <div className="flex justify-end gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-4">
          <Link href={cancelHref} className={buttonClasses("secondary")}>
            Cancelar
          </Link>
          <SubmitButton>{client ? "Guardar cambios" : "Crear cliente"}</SubmitButton>
        </div>
      </Card>
    </form>
  );
}
