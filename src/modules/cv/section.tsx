import Link from "next/link";
import { FileText } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { profileIsEmpty, type CvProfile } from "@/lib/cv/profile";
import { CvReadForm } from "@/modules/cv/read-form";
import { readCvAction } from "@/modules/cv/actions";
import { CV_QUALITY, CV_SOURCE, CV_STATUS } from "@/modules/cv/labels";
import type { CvProfileRow } from "@/modules/cv/repository";

/** Resumen de lectura de un perfil confirmado (texto plano; React escapa todo). */
export function CvProfileSummary({ p }: { p: CvProfile }) {
  if (profileIsEmpty(p)) return <p className="text-sm text-neutral-500">Perfil sin datos.</p>;
  return (
    <div className="space-y-4 text-sm">
      {p.resumen ? <p>{p.resumen}</p> : null}
      <dl className="grid gap-4 sm:grid-cols-3">
        <div><dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Puesto actual</dt><dd>{p.puesto_actual || "—"}</dd></div>
        <div><dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Experiencia total</dt><dd>{p.anios_experiencia ? `${p.anios_experiencia} años` : "—"}</dd></div>
        <div><dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Idiomas</dt><dd>{p.idiomas.map((i) => `${i.idioma} ${i.nivel}`).join(" · ") || "—"}</dd></div>
      </dl>
      {p.experiencia.length ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Trayectoria</p>
          <ol className="mt-1 space-y-2">
            {p.experiencia.map((e, i) => (
              <li key={i} className="border-l-2 border-brand-600 pl-3">
                <p className="font-semibold">{e.cargo}{e.empresa ? <span className="font-normal text-neutral-600"> · {e.empresa}</span> : null}</p>
                <p className="text-xs text-neutral-500">{[e.desde, e.hasta].filter(Boolean).join(" – ")}</p>
                {e.logros.length ? <ul className="mt-1 list-disc pl-5 text-neutral-700">{e.logros.map((l, k) => <li key={k}>{l}</li>)}</ul> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <dl className="grid gap-4 sm:grid-cols-2">
        {p.formacion.length ? <div><dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Formación</dt><dd>{p.formacion.map((f) => [f.titulo, f.institucion, f.periodo].filter(Boolean).join(", ")).join(" · ")}</dd></div> : null}
        {p.habilidades.length ? <div><dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Habilidades</dt><dd>{p.habilidades.join(" · ")}</dd></div> : null}
        {p.certificaciones.length ? <div><dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Certificaciones</dt><dd>{p.certificaciones.join(" · ")}</dd></div> : null}
        {p.licencias.length ? <div><dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Licencias</dt><dd>{p.licencias.join(" · ")}</dd></div> : null}
      </dl>
    </div>
  );
}

export function CvProfileSection({ candidateId, profiles, documents, canEdit }: { candidateId: string; profiles: CvProfileRow[]; documents: Array<{ id: string; file_name: string; mime: string; kind: string }>; canEdit: boolean }) {
  const confirmed = profiles.find((p) => p.status === "confirmado");
  const drafts = profiles.filter((p) => p.status === "borrador");
  return (
    <Card className="mt-6">
      <CardHeader
        title="Perfil curricular"
        description="Información extraída del currículum, revisada y confirmada por una persona."
        action={confirmed ? <Badge def={CV_STATUS.confirmado} /> : <FileText className="h-5 w-5 text-brand-600" aria-hidden />}
      />
      <div className="px-5 py-4">
        {confirmed ? (
          <>
            <CvProfileSummary p={confirmed.data} />
            <p className="mt-3 text-xs text-neutral-500">
              Confirmado {confirmed.confirmed_at ? formatDate(confirmed.confirmed_at) : ""}{confirmed.confirmer?.full_name ? ` por ${confirmed.confirmer.full_name}` : ""} ·{" "}
              {CV_SOURCE[confirmed.source]}{confirmed.document?.file_name ? ` · ${confirmed.document.file_name}` : ""} ·{" "}
              <Link className="font-semibold text-brand-700 underline" href={`/candidatos/${candidateId}/perfil-cv/${confirmed.id}`}>Ver detalle</Link>
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-500">Sin perfil curricular confirmado.</p>
        )}
      </div>
      {drafts.length ? (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-100" aria-label="Lecturas pendientes de revisión">
          {drafts.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <span>
                <span className="font-semibold">Lectura del {formatDate(d.created_at)}</span>
                <span className="text-neutral-500"> · {d.document?.file_name ?? "texto pegado"} · {CV_SOURCE[d.source]}</span>
                {d.quality_note ? <span className="block text-xs text-neutral-600">{d.quality_note}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <Badge def={CV_QUALITY[d.quality]} />
                <Link className="font-semibold text-brand-700 underline" href={`/candidatos/${candidateId}/perfil-cv/${d.id}`}>Revisar y confirmar</Link>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit ? (
        <div className="border-t border-neutral-100 px-5 py-4">
          <CvReadForm action={readCvAction} candidateId={candidateId} documents={documents.filter((d) => d.kind === "curriculum").map((d) => ({ id: d.id, file_name: d.file_name, mime: d.mime }))} />
        </div>
      ) : null}
    </Card>
  );
}
