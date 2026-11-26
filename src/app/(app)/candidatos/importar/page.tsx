import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { DataTable } from "@/components/ui/data-table";
import { Alert } from "@/components/ui/alert";
import { ImportWizard } from "@/modules/candidates/import-wizard";
import { getActiveConsentText, listImportBatches } from "@/modules/candidates/repository";
import { requireSessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { isDemoMode } from "@/lib/env";

export const metadata: Metadata = { title: "Importar candidatos" };

const STATUS: Record<string, string> = { cargando: "Cargando", validado: "Pendiente de revisión", importado: "Importado", cancelado: "Cancelado", revertido: "Revertido" };

export default async function ImportarPage() {
  const user = await requireSessionUser();
  if (user.role !== "admin" && user.role !== "coordinador") return <Forbidden message="Solo administración y coordinación importan candidatos." />;
  const [consent, batches] = await Promise.all([getActiveConsentText(), listImportBatches()]);
  return (
    <>
      <PageHeader title="Importar candidatos" description="Carga masiva desde Excel o CSV con validación previa y revisión humana de duplicados." />
      {isDemoMode() ? <Alert className="mb-4">Modo demostración: la importación requiere Supabase.</Alert> : null}
      <Alert className="mb-4">Solo datos ficticios (correos *.test) hasta completar la puerta de seguridad S1 y la revisión jurídica.</Alert>
      <ImportWizard consentText={consent} />
      <h2 className="mb-3 mt-8 text-base font-semibold">Lotes anteriores</h2>
      <DataTable
        caption="Lotes de importación"
        rows={batches.data}
        error={batches.error}
        emptyTitle="Sin importaciones"
        columns={[
          {
            header: "Archivo",
            cell: (b) => (
              <Link href={`/candidatos/importar/${b.id}`} className="font-semibold text-ink-950 hover:text-brand-600 hover:underline">
                {b.file_name}
              </Link>
            ),
          },
          { header: "Estado", cell: (b) => STATUS[b.status] ?? b.status },
          { header: "Filas", cell: (b) => b.row_count },
          { header: "Resultado", cell: (b) => (b.status === "importado" || b.status === "revertido" ? `${b.created_count} creados · ${b.updated_count} actualizados · ${b.skipped_count} omitidos` : "—") },
          { header: "Responsable", cell: (b) => b.creator?.full_name ?? "—" },
          { header: "Fecha", cell: (b) => formatDate(b.created_at) },
        ]}
      />
    </>
  );
}
