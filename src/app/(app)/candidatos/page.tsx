import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { CreateButton } from "@/components/ui/create-button";
import { listCandidates } from "@/modules/candidates/repository";
import { formatDate, fullName } from "@/lib/format";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Candidatos" };

export default async function CandidatosPage() {
  const [user, { data, error }] = await Promise.all([requireSessionUser(), listCandidates()]);
  return (
    <>
      <PageHeader
        title="Candidatos"
        description="Banco de talento de TPC. Datos personales protegidos por la Ley 8968."
        actions={<CreateButton label="Nuevo candidato" allowed={can(user.role, "candidatos:crear")} />}
      />
      <DataTable
        caption="Listado de candidatos"
        rows={data}
        error={error}
        emptyTitle="Sin candidatos"
        emptyDescription="Los candidatos registrados aparecerán aquí."
        columns={[
          { header: "Nombre", cell: (c) => <span className="font-semibold text-ink-950">{fullName(c)}</span> },
          { header: "Puesto actual", cell: (c) => c.current_title ?? "—" },
          { header: "Experiencia", cell: (c) => (c.years_experience != null ? `${c.years_experience} años` : "—") },
          { header: "Inglés", cell: (c) => c.english_level ?? "—" },
          { header: "Provincia", cell: (c) => c.province ?? "—" },
          { header: "Fuente", cell: (c) => c.source ?? "—" },
          {
            header: "Consentimiento",
            cell: (c) =>
              c.consent_given ? (
                <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-4 w-4" aria-hidden />Sí</span>
              ) : (
                <span className="text-brand-700">Pendiente</span>
              ),
          },
          { header: "Registro", cell: (c) => formatDate(c.created_at) },
        ]}
      />
    </>
  );
}
