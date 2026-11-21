import type { Metadata } from "next";
import { Star } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { CreateButton } from "@/components/ui/create-button";
import { listApplications } from "@/modules/applications/repository";
import { APPLICATION_STAGE } from "@/modules/labels";
import { formatDate, fullName } from "@/lib/format";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Postulaciones" };

export default async function PostulacionesPage() {
  const [user, { data, error }] = await Promise.all([requireSessionUser(), listApplications()]);
  return (
    <>
      <PageHeader
        title="Postulaciones"
        description="Avance de cada candidato en las vacantes."
        actions={<CreateButton label="Nueva postulación" allowed={can(user.role, "postulaciones:crear")} />}
      />
      <DataTable
        caption="Listado de postulaciones"
        rows={data}
        error={error}
        emptyTitle="Sin postulaciones"
        emptyDescription="No hay postulaciones visibles para su usuario."
        columns={[
          { header: "Candidato", cell: (a) => <span className="font-semibold text-ink-950">{fullName(a.candidate)}</span> },
          { header: "Vacante", cell: (a) => a.vacancy?.title ?? "—" },
          { header: "Código", cell: (a) => <span className="font-mono text-xs">{a.vacancy?.code ?? "—"}</span> },
          { header: "Etapa", cell: (a) => <Badge def={APPLICATION_STAGE[a.stage]} /> },
          {
            header: "Calificación",
            cell: (a) =>
              a.rating ? (
                <span className="inline-flex gap-0.5" aria-label={`${a.rating} de 5`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} className={`h-3.5 w-3.5 ${i < a.rating! ? "fill-brand-600 text-brand-600" : "text-neutral-300"}`} aria-hidden />
                  ))}
                </span>
              ) : (
                "—"
              ),
          },
          { header: "Postulación", cell: (a) => formatDate(a.applied_at) },
          { header: "Último cambio", cell: (a) => formatDate(a.stage_changed_at) },
        ]}
      />
    </>
  );
}
