import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { getActiveConsentText, getCandidate, getCandidatePrivate, listCandidateApplications, listCandidateConsents } from "@/modules/candidates/repository";
import { addConsentAction, revokeConsentAction } from "@/modules/candidates/actions";
import { AddConsentForm, RevokeConsentForm } from "@/modules/candidates/consent-forms";
import { APPLICATION_STAGE, CANDIDATE_STATUS, CONSENT_CHANNEL, NATIONAL_ID_TYPE, VACANCY_STATUS } from "@/modules/labels";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { formatCurrency, formatDate } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { param, type RawSearchParams } from "@/lib/search-params";
import type { VacancyStatus } from "@/types/database";

export const metadata: Metadata = { title: "Candidato" };

function Item({ n, label, value }: { n?: number; label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {n ? `${n}. ` : ""}
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink-950">{value || "—"}</dd>
    </div>
  );
}

export default async function CandidatoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const [user, c] = await Promise.all([requireSessionUser(), getCandidate(id)]);
  if (!c) notFound();
  const operational = can(user.role, "candidatos:editar");
  // Datos sensibles: solo personal operativo autorizado; la BD registra la consulta.
  const [priv, consents, applications, consentText] = await Promise.all([
    operational ? getCandidatePrivate(id, "Consulta de la ficha") : Promise.resolve(null),
    operational ? listCandidateConsents(id) : Promise.resolve({ data: [], error: null }),
    listCandidateApplications(id),
    getActiveConsentText(),
  ]);
  const name = `${c.first_name} ${c.last_name}`;
  const profiles = (c.profiles ?? []).filter((p) => p.position).sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  const canEdit = operational && Boolean(priv) && c.status !== "fusionado";

  return (
    <>
      <PageHeader
        title={name}
        description={profiles[0]?.position?.name ?? c.current_title ?? "Candidato"}
        actions={
          canEdit ? (
            <Link href={`/candidatos/${id}/editar`} className={buttonClasses("primary")}>
              <Pencil className="h-4 w-4" aria-hidden /> Editar
            </Link>
          ) : null
        }
      />
      <Flash code={param(sp, "ok")} />
      {c.status === "fusionado" && c.merged_into_id ? (
        <Alert className="mb-4">
          Esta ficha se fusionó con otra. <Link className="font-semibold underline" href={`/candidatos/${c.merged_into_id}`}>Abrir la ficha conservada</Link>.
        </Alert>
      ) : null}
      {c.status === "no_contactar" ? <Alert tone="error" className="mb-4">Sin consentimiento vigente: no contactar a esta persona.</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Ficha" action={<Badge def={CANDIDATE_STATUS[c.status ?? "activo"]} />} />
          <dl className="grid gap-5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
            <Item n={1} label="Nombre completo" value={name} />
            <Item n={2} label="Teléfono" value={priv ? [priv.phone, priv.phone_alt].filter(Boolean).join(" · ") : <Restricted />} />
            <Item n={3} label="Correo electrónico" value={priv ? priv.email : <Restricted />} />
            <Item n={4} label="Provincia" value={c.province} />
            <Item n={5} label="Cantón" value={c.canton} />
            <Item n={6} label="Distrito" value={c.district} />
            <Item n={7} label="Localidad" value={c.locality} />
            <Item
              n={8}
              label="Perfiles profesionales"
              value={profiles.length ? profiles.map((p) => `${p.position!.name}${p.is_primary ? " (principal)" : ""}`).join(" · ") : c.current_title}
            />
            <Item n={9} label="Fuente de recepción" value={[c.channel?.name ?? c.source, c.source_detail].filter(Boolean).join(" · ")} />
          </dl>
          <dl className="grid gap-5 border-t border-neutral-100 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
            <Item label="Identificación" value={priv ? (priv.national_id ? `${priv.national_id_type ? NATIONAL_ID_TYPE[priv.national_id_type] + " " : ""}${priv.national_id}` : null) : <Restricted />} />
            <Item label="Pretensión salarial" value={priv ? (priv.expected_salary != null ? formatCurrency(priv.expected_salary, priv.salary_currency) : null) : <Restricted />} />
            <Item label="Experiencia" value={c.years_experience != null ? `${c.years_experience} años` : null} />
            <Item label="Inglés" value={c.english_level} />
            <Item label="Responsable" value={c.owner?.full_name} />
            <Item
              label="Trazabilidad"
              value={`Registrado ${formatDate(c.created_at)}${c.creator?.full_name ? ` por ${c.creator.full_name}` : ""}${c.updated_at ? ` · actualizado ${formatDate(c.updated_at)}${c.updater?.full_name ? ` por ${c.updater.full_name}` : ""}` : ""}`}
            />
            {priv?.confidential_notes ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <Item label="Notas confidenciales" value={<span className="whitespace-pre-line">{priv.confidential_notes}</span>} />
              </div>
            ) : null}
          </dl>
          {operational && priv ? <p className="border-t border-neutral-100 px-5 py-3 text-xs text-neutral-500">Esta consulta de datos sensibles quedó registrada.</p> : null}
        </Card>

        <Card>
          <CardHeader title="Consentimiento informado" description="Ley 8968 · versionado" />
          <div className="space-y-3 px-5 py-5 text-sm">
            {!operational ? (
              <p>{c.consent_given ? `Vigente desde ${formatDate(c.consent_at)}.` : "Sin consentimiento vigente."}</p>
            ) : consents.data.length === 0 ? (
              <p className="text-neutral-500">Sin consentimientos registrados.</p>
            ) : (
              <ul className="space-y-3">
                {consents.data.map((k) => (
                  <li key={k.id} className={k.revoked_at ? "opacity-70" : ""}>
                    <p className="font-semibold">
                      Versión {k.text?.version ?? "—"} · {CONSENT_CHANNEL[k.channel]}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Otorgado {formatDate(k.given_at)}
                      {k.evidence ? ` · ${k.evidence}` : ""}
                      {k.revoked_at ? ` · revocado ${formatDate(k.revoked_at)} (${k.revoke_reason ?? ""})` : " · vigente"}
                    </p>
                    {!k.revoked_at && canEdit ? <RevokeConsentForm action={revokeConsentAction} consentId={k.id} candidateId={c.id} /> : null}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && consentText && !c.consent_given ? <AddConsentForm action={addConsentAction} candidateId={c.id} version={consentText.version} /> : null}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Historial de participación en procesos" description="Postulaciones a vacantes (visibles según su rol)." />
        {applications.error ? <p className="px-5 py-4 text-sm text-brand-700">{applications.error}</p> : null}
        {applications.data.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">Sin participación en procesos.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {applications.data.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  {a.vacancy ? (
                    <Link href={`/vacantes/${a.vacancy.id}`} className="font-semibold text-ink-950 hover:text-brand-600 hover:underline">
                      {a.vacancy.title}
                    </Link>
                  ) : (
                    "Vacante"
                  )}
                  <p className="text-xs text-neutral-500">
                    {a.vacancy?.code} · {a.vacancy?.requisition?.client?.name ?? "Cliente"} · postulado {formatDate(a.applied_at)} · última etapa {formatDate(a.stage_changed_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge def={APPLICATION_STAGE[a.stage]} />
                  {a.vacancy ? <Badge def={VACANCY_STATUS[a.vacancy.status as VacancyStatus]} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Restricted() {
  return (
    <span className="inline-flex items-center gap-1 text-neutral-500">
      <Lock className="h-3.5 w-3.5" aria-hidden /> Restringido para su rol
    </span>
  );
}
