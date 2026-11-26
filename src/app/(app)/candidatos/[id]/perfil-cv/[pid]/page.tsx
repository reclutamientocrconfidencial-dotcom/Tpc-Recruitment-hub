import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { getCandidate } from "@/modules/candidates/repository";
import { getCvProfile } from "@/modules/cv/repository";
import { CvProfileEditor } from "@/modules/cv/editor";
import { discardCvProfileAction, saveCvProfileAction } from "@/modules/cv/actions";
import { CV_QUALITY, CV_SOURCE, CV_STATUS } from "@/modules/cv/labels";
import { InlineAction } from "@/modules/common/inline-action";

export const metadata: Metadata = { title: "Perfil curricular" };

export default async function PerfilCvPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  if (!isUuid(id) || !isUuid(pid)) notFound();
  const user = await requireSessionUser();
  if (!can(user.role, "candidatos:editar")) notFound();
  const [c, p] = await Promise.all([getCandidate(id), getCvProfile(pid)]);
  if (!c || !p || p.candidate_id !== id) notFound();
  const draft = p.status === "borrador";
  return (
    <>
      <PageHeader
        title="Perfil curricular"
        description={`${c.first_name} ${c.last_name} · ${p.document?.file_name ?? "texto pegado"}`}
        actions={<Link href={`/candidatos/${id}`} className="text-sm font-semibold text-brand-700 underline">Volver a la ficha</Link>}
      />
      {p.quality === "ilegible" ? (
        <Alert tone="error" className="mb-4">{p.quality_note ?? "El documento no se pudo interpretar."} Complete el perfil manualmente a partir del archivo original.</Alert>
      ) : p.quality === "parcial" ? (
        <Alert className="mb-4">{p.quality_note ?? "La lectura fue parcial."} Compare con el archivo original antes de confirmar.</Alert>
      ) : null}
      {draft ? (
        <Alert className="mb-4">
          Revise y corrija cada dato contra el currículum original. Lo extraído automáticamente puede contener errores u omisiones y no se
          incorpora a la ficha hasta que usted lo confirme.
        </Alert>
      ) : null}
      <Card>
        <CardHeader
          title={draft ? "Revisión" : "Perfil"}
          description={`${CV_SOURCE[p.source]} · creado ${formatDate(p.created_at)}${p.creator?.full_name ? ` por ${p.creator.full_name}` : ""}${p.confirmed_at ? ` · confirmado ${formatDate(p.confirmed_at)}${p.confirmer?.full_name ? ` por ${p.confirmer.full_name}` : ""}` : ""}`}
          action={
            <span className="flex flex-wrap gap-2">
              <Badge def={CV_QUALITY[p.quality]} />
              <Badge def={CV_STATUS[p.status]} />
            </span>
          }
        />
        <CvProfileEditor id={p.id} candidateId={id} initial={p.data} readOnly={!draft} action={saveCvProfileAction} />
        {draft ? (
          <div className="border-t border-neutral-100 px-5 py-4">
            <InlineAction action={discardCvProfileAction} fields={{ id: p.id, candidate_id: id }} label="Descartar esta lectura" variant="ghost" confirmText="¿Descartar esta lectura del currículum?" />
          </div>
        ) : null}
      </Card>
    </>
  );
}
