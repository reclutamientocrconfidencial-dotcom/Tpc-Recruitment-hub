import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getPublicForm } from "@/modules/intake/repository";
import { linkCodeSchema } from "@/modules/intake/schema";
import { PublicApplicationForm } from "@/modules/intake/public-form";
import { submitPublicFormAction } from "@/modules/intake/public-actions";
import { EMPLOYMENT_TYPE, WORK_MODALITY } from "@/modules/labels";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Postulación", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PublicFormPage({ params }: { params: Promise<{ code: string }> }) {
  const parsed = linkCodeSchema.safeParse((await params).code);
  if (!parsed.success) notFound();
  const form = await getPublicForm(parsed.data);
  if (!form.available) {
    return (
      <Card className="p-8 text-center">
        <h1 className="text-xl font-bold text-ink-950">Formulario no disponible</h1>
        <p className="mt-2 text-sm text-neutral-600">Este enlace ya no recibe postulaciones. Puede que la vacante se haya cerrado.</p>
      </Card>
    );
  }
  const v = form.vacancy;
  return (
    <>
      <h1 className="text-2xl font-bold text-ink-950">{form.title}</h1>
      {v ? (
        <p className="mt-1 text-sm text-neutral-600">
          {[v.title, v.province, v.modality ? WORK_MODALITY[v.modality] : null, v.employment_type ? EMPLOYMENT_TYPE[v.employment_type] : null, v.work_schedule]
            .filter(Boolean)
            .join(" · ")}
          {v.closes_at ? ` · Recibimos postulaciones hasta el ${formatDate(v.closes_at)}` : ""}
        </p>
      ) : null}
      {form.intro ? <p className="mt-4 whitespace-pre-line text-sm text-neutral-700">{form.intro}</p> : null}
      {v?.description ? (
        <details className="mt-4 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Descripción del puesto</summary>
          <p className="mt-2 whitespace-pre-line text-neutral-700">{v.description}</p>
        </details>
      ) : null}
      <Card className="mt-6 p-5 sm:p-8">
        <PublicApplicationForm action={submitPublicFormAction} code={parsed.data} form={form} startedAt={Date.now()} />
      </Card>
    </>
  );
}
