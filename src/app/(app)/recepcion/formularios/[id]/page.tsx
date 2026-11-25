import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Flash } from "@/components/ui/flash";
import { Forbidden } from "@/components/ui/forbidden";
import { buttonClasses } from "@/components/ui/button";
import { InlineAction } from "@/modules/common/inline-action";
import { getForm, listActiveChannels } from "@/modules/intake/repository";
import { addQuestionAction, createLinkAction, toggleFormAction, toggleLinkAction, toggleQuestionAction, updateFormAction } from "@/modules/intake/actions";
import { EditFormForm, LinkForm, QuestionForm } from "@/modules/intake/admin-forms";
import { publicLinkUrl } from "@/modules/intake/schema";
import { QUESTION_KIND, VACANCY_STATUS } from "@/modules/labels";
import { pagePermission } from "@/lib/auth/guards";
import { formatDate } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { qrSvg } from "@/lib/qr";
import { siteOrigin } from "@/lib/site";
import { param, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Formulario público" };

export default async function FormularioPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const { allowed } = await pagePermission("formularios:gestionar");
  if (!allowed) return <Forbidden message="Solo administración y coordinación gestionan los formularios públicos." />;
  const [form, channels, origin] = await Promise.all([getForm(id), listActiveChannels(), siteOrigin()]);
  if (!form) notFound();
  const vacancyClosed = form.vacancy && !["abierta", "pausada"].includes(form.vacancy.status);
  return (
    <>
      <PageHeader
        title={form.title}
        description={form.vacancy ? `${form.vacancy.code} · ${form.vacancy.title}` : "Banco de talento (sin vacante)"}
        actions={
          <InlineAction
            action={toggleFormAction}
            fields={{ id: form.id, form_id: form.id, active: String(!form.is_active) }}
            label={form.is_active ? "Desactivar formulario" : "Activar formulario"}
            variant={form.is_active ? "secondary" : "primary"}
          />
        }
      />
      <Flash code={param(sp, "ok")} />
      {!form.is_active ? <Alert tone="error" className="mb-4">Formulario inactivo: sus enlaces no reciben postulaciones.</Alert> : null}
      {vacancyClosed && form.vacancy ? (
        <Alert className="mb-4">
          La vacante está <Badge def={VACANCY_STATUS[form.vacancy.status]} />: el formulario solo recibe envíos con la vacante abierta o pausada.
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Configuración" />
          <div className="px-5 py-5">
            <EditFormForm action={updateFormAction} form={form} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Preguntas de preselección" description="Se muestran en este orden. Las desactivadas no se preguntan." />
          <ul className="divide-y divide-neutral-100">
            {(form.questions ?? []).map((q) => (
              <li key={q.id} className={`flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm ${q.is_active ? "" : "opacity-60"}`}>
                <div>
                  <p className="font-medium">
                    {q.position}. {q.label}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {QUESTION_KIND[q.kind]}
                    {q.options.length ? `: ${q.options.join(" / ")}` : ""}
                    {q.required ? " · obligatoria" : " · opcional"}
                    {q.expected_answer ? ` · cumple si responde «${q.expected_answer === "si" ? "Sí" : q.expected_answer === "no" ? "No" : q.expected_answer}»` : ""}
                    {q.min_number != null ? ` · cumple desde ${q.min_number}` : ""}
                  </p>
                </div>
                <InlineAction action={toggleQuestionAction} fields={{ id: q.id, form_id: form.id, active: String(!q.is_active) }} label={q.is_active ? "Desactivar" : "Activar"} variant="ghost" />
              </li>
            ))}
            {(form.questions ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-neutral-500">Sin preguntas.</li> : null}
          </ul>
          <div className="border-t border-neutral-100 px-5 py-5">
            <QuestionForm action={addQuestionAction} formId={form.id} />
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Enlaces y códigos QR" description="Cree un enlace por canal (redes, ferias, volantes…) para saber de dónde llega cada candidato." />
        <ul className="divide-y divide-neutral-100">
          {(form.links ?? []).map((l) => {
            const url = publicLinkUrl(origin, l.code);
            const svg = qrSvg(url, { title: `Código QR: ${l.channel?.name ?? ""} ${l.label ?? ""}` });
            return (
              <li key={l.id} className={`flex flex-wrap items-center gap-5 px-5 py-4 ${l.is_active ? "" : "opacity-60"}`}>
                <div className="h-32 w-32 shrink-0 rounded border border-neutral-200" dangerouslySetInnerHTML={{ __html: svg }} />
                <div className="min-w-64 flex-1 space-y-1 text-sm">
                  <p className="font-semibold">
                    {l.channel?.name ?? "Canal"}
                    {l.label ? ` · ${l.label}` : ""} {l.is_active ? null : <Badge def={{ label: "Inactivo", tone: "muted" }} />}
                  </p>
                  <p className="break-all font-mono text-xs" data-testid="public-link">
                    {url}
                  </p>
                  <p className="text-xs text-neutral-500">Creado {formatDate(l.created_at)}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link href={`/p/${l.code}`} target="_blank" className={buttonClasses("ghost")}>
                      <ExternalLink className="h-4 w-4" aria-hidden /> Abrir
                    </Link>
                    <a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} download={`qr-${l.code}.svg`} className={buttonClasses("ghost")}>
                      <Download className="h-4 w-4" aria-hidden /> Descargar QR
                    </a>
                    <InlineAction action={toggleLinkAction} fields={{ id: l.id, form_id: form.id, active: String(!l.is_active) }} label={l.is_active ? "Desactivar" : "Activar"} variant="ghost" />
                  </div>
                </div>
              </li>
            );
          })}
          {(form.links ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-neutral-500">Sin enlaces: cree uno para publicar el formulario.</li> : null}
        </ul>
        <div className="border-t border-neutral-100 px-5 py-5">
          <LinkForm action={createLinkAction} formId={form.id} channels={channels.data} />
        </div>
      </Card>
    </>
  );
}
