import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { listConsentTexts } from "@/modules/candidates/repository";
import { activateConsentTextAction, approveConsentTextAction, createConsentTextAction } from "@/modules/candidates/consent-admin-actions";
import { ApproveConsentForm, ConsentTextForm } from "@/modules/candidates/consent-admin-forms";
import { InlineAction } from "@/modules/common/inline-action";
import { pagePermission } from "@/lib/auth/guards";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Consentimiento informado" };

export default async function ConsentimientosPage() {
  const { allowed } = await pagePermission("usuarios:gestionar");
  if (!allowed) return <Forbidden message="Solo administradores gestionan los textos de consentimiento." />;
  const texts = await listConsentTexts();
  return (
    <>
      <PageHeader title="Consentimiento informado" description="Textos versionados (Ley 8968). Un texto ya otorgado no se modifica: se crea una versión nueva." />
      <Alert className="mb-4">Para cargar datos reales, la versión vigente debe tener aprobación jurídica (puerta S1).</Alert>
      {texts.error ? <Alert tone="error">{texts.error}</Alert> : null}
      <div className="mb-6 space-y-4">
        {texts.data.map((t) => (
          <Card key={t.id}>
            <CardHeader
              title={`Versión ${t.version}`}
              description={`${t.title} · ${formatDate(t.created_at)}`}
              action={
                <span className="flex gap-2 text-xs font-semibold">
                  {t.is_active ? <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Vigente</span> : null}
                  {t.legal_approved ? (
                    <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Aprobación jurídica</span>
                  ) : (
                    <span className="rounded bg-amber-50 px-2 py-1 text-amber-800">Sin aprobación jurídica</span>
                  )}
                </span>
              }
            />
            <div className="space-y-3 px-5 py-4 text-sm">
              <p className="whitespace-pre-line text-neutral-700">{t.body}</p>
              {t.legal_note ? <p className="text-xs text-neutral-500">{t.legal_note}</p> : null}
              <div className="flex flex-wrap gap-4">
                {!t.is_active ? <InlineAction action={activateConsentTextAction} fields={{ id: t.id }} label="Publicar como vigente" variant="dark" confirmText="¿Publicar esta versión como la vigente?" /> : null}
                {!t.legal_approved ? <ApproveConsentForm action={approveConsentTextAction} id={t.id} /> : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <ConsentTextForm action={createConsentTextAction} />
    </>
  );
}
