import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Lock, Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { getActiveConsentText, getCandidate, getCandidatePrivate, listCandidateApplications, listCandidateConsents } from "@/modules/candidates/repository";
import { addConsentAction, revokeConsentAction } from "@/modules/candidates/actions";
import { AddConsentForm, RevokeConsentForm } from "@/modules/candidates/consent-forms";
import { ApplyForm } from "@/modules/applications/application-forms";
import { createApplicationAction } from "@/modules/applications/actions";
import { listOpenVacanciesForCandidate } from "@/modules/applications/repository";
import { APPLICATION_STAGE, CANDIDATE_STATUS, CONSENT_CHANNEL, NATIONAL_ID_TYPE, VACANCY_STATUS } from "@/modules/labels";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { formatCurrency, formatDate } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { param, type RawSearchParams } from "@/lib/search-params";
import type { VacancyStatus } from "@/types/database";
import { listCandidateDocuments } from "@/modules/intake/repository";
import { uploadCandidateDocumentAction } from "@/modules/intake/actions";
import { DocumentUploadForm } from "@/modules/intake/admin-forms";
import { formatBytes } from "@/lib/files";
import { listCandidateCredentials, listCredentialTypes, todayCR } from "@/modules/evaluations/repository";
import { addCredentialAction, verifyCredentialAction } from "@/modules/evaluations/actions";
import { CredentialForm } from "@/modules/evaluations/forms";
import { InlineAction } from "@/modules/common/inline-action";
import { credentialValidity } from "@/modules/labels";
import { AiPanel } from "@/modules/ai/ai-panel";
import { getAiSettings, listAiRequests } from "@/modules/ai/repository";

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
  const canApply = can(user.role, "postulaciones:crear") && c.status === "activo" && c.consent_given;
  const [priv, consents, applications, consentText, openVacancies, documents, credentials, credentialTypes, aiSettings, aiRequests] = await Promise.all([
    operational ? getCandidatePrivate(id, "Consulta de la ficha") : Promise.resolve(null),
    operational ? listCandidateConsents(id) : Promise.resolve({ data: [], error: null }),
    listCandidateApplications(id),
    getActiveConsentText(),
    canApply ? listOpenVacanciesForCandidate(id) : Promise.resolve([]),
    // Currículums: solo personal operativo (RLS: mismos permisos que los datos sensibles).
    operational ? listCandidateDocuments(id) : Promise.resolve({ data: [], error: null }),
    operational ? listCandidateCredentials(id) : Promise.resolve({ data: [], error: null }),
    operational ? listCredentialTypes() : Promise.resolve({ data: [], error: null }),
    operational ? getAiSettings() : Promise.resolve(null),
    operational ? listAiRequests({ candidate_id: id }) : Promise.resolve({ data: [], error: null }),
  ]);
  const today = todayCR();
  const docName = new Map(documents.data.map((d) => [d.id, d.file_name]));
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

      {operational && priv ? (
        <Card className="mt-6">
          <CardHeader title="Currículums y documentos" description="Almacenamiento privado. Cada descarga usa un enlace temporal y queda registrada." />
          {documents.data.length === 0 ? (
            <p className="px-5 py-5 text-sm text-neutral-500">Sin currículums.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {documents.data.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium">{d.file_name}</p>
                    <p className="text-xs text-neutral-500">
                      {d.kind === "credencial" ? "Respaldo de credencial · " : ""}{formatBytes(d.size_bytes)} · {d.source === "formulario" ? "Recibido por formulario público" : `Cargado por ${d.uploader?.full_name ?? "el personal"}`} · {formatDate(d.created_at)}
                    </p>
                  </div>
                  <a href={`/api/documentos/${d.id}`} className={buttonClasses("secondary")}>
                    <Download className="h-4 w-4" aria-hidden /> Descargar
                  </a>
                </li>
              ))}
            </ul>
          )}
          {canEdit ? (
            <div className="border-t border-neutral-100 px-5 py-4">
              <DocumentUploadForm action={uploadCandidateDocumentAction} candidateId={c.id} />
            </div>
          ) : null}
        </Card>
      ) : null}

      {operational && priv ? (
        <Card className="mt-6">
          <CardHeader title="Licencias, carnés y certificaciones" description="Control de vigencia con alertas de vencimiento." />
          {credentials.data.length === 0 ? (
            <p className="px-5 py-4 text-sm text-neutral-500">Sin credenciales registradas.</p>
          ) : (
            <ul className="divide-y divide-neutral-100" aria-label="Credenciales">
              {credentials.data.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-semibold">
                      {k.type?.name} {k.identifier ? <span className="font-normal text-neutral-600">· {k.identifier}</span> : null}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {k.issued_on ? `Emitido ${formatDate(k.issued_on)} · ` : ""}
                      {k.expires_on ? `Vence ${formatDate(k.expires_on)}` : "Sin vencimiento"}
                      {k.document_id ? ` · Respaldo: ${docName.get(k.document_id) ?? "archivo"}` : ""}
                      {k.verified_at ? ` · Verificado ${formatDate(k.verified_at)}${k.verifier?.full_name ? ` por ${k.verifier.full_name}` : ""}` : " · Sin verificar"}
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <Badge def={credentialValidity(k.expires_on, k.type?.alert_days ?? 30, today)} />
                    {!k.verified_at ? <InlineAction action={verifyCredentialAction} fields={{ id: k.id, candidate_id: c.id }} label="Marcar verificada" variant="ghost" /> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-neutral-100 px-5 py-4">
            <CredentialForm action={addCredentialAction} candidateId={c.id} types={credentialTypes.data} />
          </div>
        </Card>
      ) : null}

      {operational && priv ? (
        <AiPanel
          settings={aiSettings}
          requests={aiRequests.data}
          path={`/candidatos/${c.id}`}
          runs={[{ feature: "extraer_cv", label: "Extraer perfil del CV", fields: { candidate_id: c.id }, withText: true }]}
        />
      ) : null}

      <Card className="mt-6">
        <CardHeader title="Historial de participación en procesos" description="Postulaciones a vacantes (visibles según su rol)." />
        {canApply ? (
          <div className="border-b border-neutral-100 px-5 py-4">
            <ApplyForm action={createApplicationAction} candidateId={c.id} vacancies={openVacancies} />
          </div>
        ) : null}
        {applications.error ? <p className="px-5 py-4 text-sm text-brand-700">{applications.error}</p> : null}
        {applications.data.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">Sin participación en procesos.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {applications.data.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  {a.vacancy ? (
                    <Link href={`/postulaciones/${a.id}`} className="font-semibold text-ink-950 hover:text-brand-600 hover:underline">
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
