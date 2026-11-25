"use client";

import { startTransition, useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field, SelectInput, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";
import type { AiSettings } from "@/modules/ai/repository";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function AiSettingsForm({ action, settings, models }: { action: Action; settings: AiSettings; models: readonly string[] }) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const [provider, setProvider] = useState(settings.provider);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      aria-label="Configuración de IA"
      className="space-y-4"
    >
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok ? <p className="text-sm text-emerald-700" role="status">{state.message}</p> : null}
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="h-4 w-4 accent-brand-600" /> Asistente de IA activado
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="ai-provider" label="Proveedor">
          <select id="ai-provider" name="provider" value={provider} onChange={(e) => setProvider(e.target.value as AiSettings["provider"])} className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm">
            <option value="simulado">Simulado (no envía datos; para pruebas)</option>
            <option value="anthropic">Anthropic (Claude) — requiere autorización</option>
          </select>
        </Field>
        <Field id="ai-model" label="Modelo (proveedor externo)">
          <SelectInput id="ai-model" name="model" defaultValue={settings.model} options={models.map((m) => ({ value: m, label: m }))} />
        </Field>
        <Field id="ai-budget" label="Presupuesto mensual (USD)" hint="Al alcanzarlo, la IA externa se bloquea hasta el mes siguiente.">
          <TextInput id="ai-budget" name="monthly_budget_usd" type="number" min={0} step="0.01" defaultValue={String(settings.monthly_budget_usd)} hint="Al alcanzarlo, la IA externa se bloquea hasta el mes siguiente." />
        </Field>
        <Field id="ai-daily" label="Consultas por usuario por día">
          <TextInput id="ai-daily" name="daily_requests_per_user" type="number" min={1} max={500} defaultValue={String(settings.daily_requests_per_user)} />
        </Field>
      </div>
      <fieldset className="rounded-lg border border-neutral-200 p-4">
        <legend className="px-1 text-sm font-semibold">Proveedor externo</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="dpa_confirmed" defaultChecked={settings.dpa_confirmed} className="mt-0.5 h-4 w-4 accent-brand-600" />
          Confirmo que la empresa firmó el acuerdo de tratamiento de datos con el proveedor, que este no entrena modelos con los datos de TPC y que el costo está autorizado.
        </label>
        <Field id="ai-dpa-note" label="Referencia del acuerdo y de la autorización" className="mt-3">
          <TextInput id="ai-dpa-note" name="dpa_note" defaultValue={settings.dpa_note ?? ""} maxLength={500} />
        </Field>
        {provider === "anthropic" ? (
          <p className="mt-3 text-xs text-neutral-600">
            Requiere además el secreto <code>ANTHROPIC_API_KEY</code> en el servidor y una sesión con verificación en dos pasos. Mientras no se habiliten datos reales,
            solo hay datos ficticios en el sistema.
          </p>
        ) : null}
      </fieldset>
      <SubmitButton pending={pending} variant="dark">
        Guardar configuración
      </SubmitButton>
    </form>
  );
}
