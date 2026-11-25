import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Forbidden } from "@/components/ui/forbidden";
import { listForms, listVacanciesWithoutForm } from "@/modules/intake/repository";
import { createFormAction } from "@/modules/intake/actions";
import { NewFormForm } from "@/modules/intake/admin-forms";
import { VACANCY_STATUS } from "@/modules/labels";
import { pagePermission } from "@/lib/auth/guards";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Formularios públicos" };

export default async function FormulariosPage() {
  const { allowed } = await pagePermission("formularios:gestionar");
  if (!allowed) return <Forbidden message="Solo administración y coordinación gestionan los formularios públicos." />;
  const [forms, vacancies] = await Promise.all([listForms(), listVacanciesWithoutForm()]);
  return (
    <>
      <PageHeader title="Formularios públicos" description="Un formulario por vacante, más formularios permanentes del banco de talento. Cada enlace identifica el canal de recepción." />
      <DataTable
        caption="Formularios"
        rows={forms.data}
        error={forms.error}
        emptyTitle="Sin formularios"
        emptyDescription="Cree el primero con el formulario de abajo."
        columns={[
          {
            header: "Formulario",
            cell: (f) => (
              <Link href={`/recepcion/formularios/${f.id}`} className="font-semibold text-ink-950 hover:text-brand-600 hover:underline">
                {f.title}
              </Link>
            ),
          },
          {
            header: "Vacante",
            cell: (f) =>
              f.vacancy ? (
                <span className="inline-flex items-center gap-2">
                  {f.vacancy.code} <Badge def={VACANCY_STATUS[f.vacancy.status]} />
                </span>
              ) : (
                "Banco de talento"
              ),
          },
          { header: "Enlaces activos", cell: (f) => (f.links ?? []).filter((l) => l.is_active).length, className: "text-center" },
          { header: "Cierre", cell: (f) => formatDate(f.closes_at) },
          { header: "Estado", cell: (f) => <Badge def={f.is_active ? { label: "Activo", tone: "success" } : { label: "Inactivo", tone: "muted" }} /> },
        ]}
      />
      <Card className="mt-6">
        <CardHeader title="Nuevo formulario" description="Solo vacantes abiertas o pausadas sin formulario. Después agregue preguntas y enlaces." />
        <div className="px-5 py-5">
          <NewFormForm action={createFormAction} vacancies={vacancies.data} />
        </div>
      </Card>
    </>
  );
}
