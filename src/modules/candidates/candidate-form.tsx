"use client";

import Link from "next/link";
import { startTransition, useActionState, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { Field, FormSection, SelectInput, TextArea, TextInput } from "@/components/ui/form";
import { SearchSelect } from "@/components/ui/search-select";
import { SubmitButton } from "@/components/ui/submit-button";
import { CONSENT_CHANNEL, NATIONAL_ID_TYPE, optionsFrom } from "@/modules/labels";
import type { CandidateFormState } from "@/modules/candidates/actions";
import { CR_PROVINCES, CURRENCIES, ENGLISH_LEVELS, type Candidate, type CandidatePrivate, type ConsentText, type JobPosition } from "@/types/database";

type Action = (prev: CandidateFormState, formData: FormData) => Promise<CandidateFormState>;

/**
 * Ficha del candidato en el orden acordado: 1 nombre · 2 teléfono · 3 correo ·
 * 4 provincia · 5 cantón · 6 distrito · 7 localidad · 8 perfil · 9 fuente.
 * Envío con onSubmit + startTransition (React 19 no reinicia los controles).
 */
export function CandidateForm({
  action,
  candidate,
  priv,
  cantons,
  positions,
  channels,
  users,
  consentText,
  cancelHref,
}: {
  action: Action;
  candidate?: Candidate;
  priv?: CandidatePrivate | null;
  cantons: Array<{ province: string; name: string }>;
  positions: JobPosition[];
  channels: Array<{ id: string; name: string }>;
  users: Array<{ id: string; full_name: string; email: string }>;
  consentText: ConsentText | null;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const c = candidate;
  const s = (v: unknown) => (v == null ? "" : String(v));
  const err = state.fieldErrors ?? {};
  const [province, setProvince] = useState(s(c?.province));
  const [canton, setCanton] = useState(s(c?.canton));
  const initialProfiles = (c?.profiles ?? []).filter((p) => p.position).map((p) => p.position!.id);
  const [profiles, setProfiles] = useState<string[]>(initialProfiles);
  const [primary, setPrimary] = useState<string>((c?.profiles ?? []).find((p) => p.is_primary)?.position?.id ?? initialProfiles[0] ?? "");
  const [pickerKey, setPickerKey] = useState(0);
  const byId = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const cantonOptions = cantons.filter((x) => !province || x.province === province).map((x) => ({ value: x.name, label: province ? x.name : `${x.name} (${x.province})` }));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending} aria-label={c ? "Editar candidato" : "Nuevo candidato"}>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      {state.error ? <Alert tone="error" className="mb-4">{state.error}</Alert> : null}
      {state.duplicates && state.duplicates.length > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4" role="region" aria-label="Posibles duplicados">
          <p className="mb-2 text-sm font-semibold text-amber-900">Coincidencias encontradas en la base de candidatos:</p>
          <ul className="mb-3 space-y-1 text-sm">
            {state.duplicates.map((d) => (
              <li key={d.candidate_id}>
                <Link href={`/candidatos/${d.candidate_id}`} target="_blank" className="font-semibold text-brand-700 hover:underline">
                  {d.full_name}
                </Link>{" "}
                — coincide en: {d.reasons.join(", ")}
                {d.blocking ? " (bloqueo)" : ""}
              </li>
            ))}
          </ul>
          {!state.duplicates.some((d) => d.blocking) ? (
            <label className="flex items-center gap-2 text-sm text-ink-950">
              <input type="checkbox" name="confirm_not_duplicate" className="h-4 w-4 accent-brand-600" />
              Revisé las coincidencias: se trata de otra persona.
            </label>
          ) : null}
        </div>
      ) : null}

      <Card>
        <FormSection title="1–3. Identificación y contacto" description="Los datos de contacto son sensibles: solo los ve el personal autorizado y cada consulta queda registrada.">
          <Field id="first_name" label="1. Nombre" required error={err.first_name}>
            <TextInput id="first_name" defaultValue={s(c?.first_name)} maxLength={100} autoComplete="off" error={err.first_name} />
          </Field>
          <Field id="last_name" label="Apellidos" required error={err.last_name}>
            <TextInput id="last_name" defaultValue={s(c?.last_name)} maxLength={150} autoComplete="off" error={err.last_name} />
          </Field>
          <Field id="phone" label="2. Teléfono" error={err.phone} hint="Ej.: 8888-8888">
            <TextInput id="phone" type="tel" defaultValue={s(priv?.phone)} maxLength={30} error={err.phone} />
          </Field>
          <Field id="phone_alt" label="Teléfono alterno" error={err.phone_alt}>
            <TextInput id="phone_alt" type="tel" defaultValue={s(priv?.phone_alt)} maxLength={30} error={err.phone_alt} />
          </Field>
          <Field id="email" label="3. Correo electrónico" error={err.email} className="sm:col-span-2">
            <TextInput id="email" type="email" defaultValue={s(priv?.email)} maxLength={200} error={err.email} />
          </Field>
        </FormSection>

        <FormSection title="4–7. Ubicación">
          <Field id="province" label="4. Provincia" error={err.province}>
            <SelectInput
              id="province"
              value={province}
              onChange={(e) => {
                setProvince(e.target.value);
                setCanton("");
              }}
              placeholder="Seleccione…"
              options={CR_PROVINCES.map((p) => ({ value: p, label: p }))}
              error={err.province}
            />
          </Field>
          <Field id="canton" label="5. Cantón" error={err.canton}>
            <SelectInput id="canton" value={canton} onChange={(e) => setCanton(e.target.value)} placeholder="Seleccione…" options={cantonOptions} error={err.canton} />
          </Field>
          <Field id="district" label="6. Distrito" error={err.district}>
            <TextInput id="district" defaultValue={s(c?.district)} maxLength={100} error={err.district} />
          </Field>
          <Field id="locality" label="7. Localidad" error={err.locality} hint="Barrio, caserío o referencia">
            <TextInput id="locality" defaultValue={s(c?.locality)} maxLength={150} error={err.locality} />
          </Field>
        </FormSection>

        <FormSection title="8. Puesto o perfil profesional" description="Puede tener varios perfiles del catálogo de puestos; marque el principal.">
          <div className="sm:col-span-2">
            {profiles.length === 0 ? <p className="mb-2 text-sm text-neutral-500">Sin perfiles todavía.</p> : null}
            <ul className="mb-3 flex flex-wrap gap-2" aria-label="Perfiles seleccionados">
              {profiles.map((id) => (
                <li key={id} className="flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-1 text-sm">
                  <input type="hidden" name="position_ids" value={id} />
                  <label className="flex items-center gap-1">
                    <input type="radio" name="primary_position_id" value={id} checked={primary === id} onChange={() => setPrimary(id)} className="accent-brand-600" />
                    {byId.get(id)?.name ?? "Puesto"}
                  </label>
                  <button
                    type="button"
                    aria-label={`Quitar ${byId.get(id)?.name ?? "perfil"}`}
                    onClick={() => {
                      setProfiles((p) => p.filter((x) => x !== id));
                      if (primary === id) setPrimary("");
                    }}
                    className="text-neutral-500 hover:text-brand-600"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="profile-picker" label="Agregar perfil del catálogo">
                <SearchSelect
                  key={pickerKey}
                  id="profile-picker"
                  name="profile_picker"
                  label="Agregar perfil del catálogo"
                  placeholder="Buscar puesto…"
                  options={positions.filter((p) => !profiles.includes(p.id)).map((p) => ({ value: p.id, label: p.name, hint: p.area, inactive: !p.is_active }))}
                  onChange={(value) => {
                    if (value && !profiles.includes(value)) {
                      setProfiles((p) => [...p, value]);
                      if (!primary) setPrimary(value);
                      setPickerKey((k) => k + 1);
                    }
                  }}
                />
              </Field>
              <Field id="position_new" label="¿No está? Puesto nuevo" hint="Se agrega al catálogo al guardar.">
                <TextInput id="position_new" maxLength={150} />
              </Field>
            </div>
          </div>
          <Field id="current_title" label="Puesto actual o último" error={err.current_title}>
            <TextInput id="current_title" defaultValue={s(c?.current_title)} maxLength={150} error={err.current_title} />
          </Field>
          <Field id="years_experience" label="Años de experiencia" error={err.years_experience}>
            <TextInput id="years_experience" type="number" min={0} max={70} step="0.5" defaultValue={s(c?.years_experience)} error={err.years_experience} />
          </Field>
          <Field id="english_level" label="Nivel de inglés" error={err.english_level}>
            <SelectInput id="english_level" defaultValue={s(c?.english_level)} placeholder="Sin indicar" options={ENGLISH_LEVELS.map((l) => ({ value: l, label: l === "ninguno" ? "Ninguno" : l === "nativo" ? "Nativo" : l }))} />
          </Field>
        </FormSection>

        <FormSection title="9. Fuente de recepción">
          <Field id="intake_channel_id" label="9. Fuente" error={err.intake_channel_id}>
            <SelectInput id="intake_channel_id" defaultValue={s(c?.intake_channel_id)} placeholder="Seleccione…" options={channels.map((ch) => ({ value: ch.id, label: ch.name }))} error={err.intake_channel_id} />
          </Field>
          <Field id="source_detail" label="Detalle de la fuente" error={err.source_detail} hint="Ej.: nombre de la feria o persona que refiere">
            <TextInput id="source_detail" defaultValue={s(c?.source_detail)} maxLength={150} error={err.source_detail} />
          </Field>
        </FormSection>

        <FormSection title="Datos complementarios (sensibles)" description="Opcionales. La cédula es única cuando existe.">
          <Field id="national_id_type" label="Tipo de identificación">
            <SelectInput id="national_id_type" defaultValue={s(priv?.national_id_type)} placeholder="Sin identificación" options={optionsFrom(NATIONAL_ID_TYPE)} />
          </Field>
          <Field id="national_id" label="Número de identificación" error={err.national_id}>
            <TextInput id="national_id" defaultValue={s(priv?.national_id)} maxLength={30} autoComplete="off" error={err.national_id} />
          </Field>
          <Field id="expected_salary" label="Pretensión salarial" error={err.expected_salary}>
            <TextInput id="expected_salary" type="number" min={0} step="0.01" defaultValue={s(priv?.expected_salary)} error={err.expected_salary} />
          </Field>
          <Field id="salary_currency" label="Moneda">
            <SelectInput id="salary_currency" defaultValue={s(priv?.salary_currency ?? "CRC")} options={CURRENCIES.map((x) => ({ value: x, label: x }))} />
          </Field>
          <Field id="confidential_notes" label="Notas confidenciales" error={err.confidential_notes} className="sm:col-span-2" hint="No registre datos de salud ni otros datos sensibles innecesarios.">
            <TextArea id="confidential_notes" defaultValue={s(priv?.confidential_notes)} maxLength={4000} error={err.confidential_notes} />
          </Field>
          <Field id="owner_id" label="Responsable">
            <SelectInput id="owner_id" defaultValue={s(c?.owner_id)} placeholder="Yo" options={users.map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
          </Field>
        </FormSection>

        {!c ? (
          <FormSection title="Consentimiento informado (Ley 8968)" description="Obligatorio: ningún candidato se registra sin consentimiento vigente.">
            <div className="sm:col-span-2">
              {consentText ? (
                <details className="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
                  <summary className="cursor-pointer font-semibold">
                    {consentText.title} · versión {consentText.version}
                    {consentText.legal_approved ? "" : " (borrador sin aprobación jurídica)"}
                  </summary>
                  <p className="mt-2 whitespace-pre-line text-neutral-700">{consentText.body}</p>
                </details>
              ) : (
                <Alert tone="error">No hay una versión vigente del consentimiento. Solicite a un administrador que la publique.</Alert>
              )}
              <label className="flex items-center gap-2 text-sm text-ink-950">
                <input type="checkbox" name="consent_given" className="h-4 w-4 accent-brand-600" />
                El candidato leyó y aceptó este consentimiento.
              </label>
              {err.consent_given ? <p className="mt-1 text-xs text-brand-700">{err.consent_given}</p> : null}
            </div>
            <Field id="consent_channel" label="¿Cómo lo otorgó?" required error={err.consent_channel}>
              <SelectInput id="consent_channel" defaultValue="" placeholder="Seleccione…" options={optionsFrom(CONSENT_CHANNEL)} error={err.consent_channel} />
            </Field>
            <Field id="consent_evidence" label="Evidencia" error={err.consent_evidence} hint="Ej.: formulario firmado n.° 123, correo del 10/11">
              <TextInput id="consent_evidence" maxLength={300} error={err.consent_evidence} />
            </Field>
          </FormSection>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-4">
          <Link href={cancelHref} className={buttonClasses("secondary")}>
            Cancelar
          </Link>
          <SubmitButton pending={pending}>{c ? "Guardar cambios" : "Registrar candidato"}</SubmitButton>
        </div>
      </Card>
    </form>
  );
}
