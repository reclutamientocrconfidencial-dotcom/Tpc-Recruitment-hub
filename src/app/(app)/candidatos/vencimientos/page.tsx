import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Forbidden } from "@/components/ui/forbidden";
import { listExpiringCredentials } from "@/modules/evaluations/repository";
import { pagePermission } from "@/lib/auth/guards";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Vencimientos de credenciales" };

export default async function VencimientosPage() {
  const { allowed } = await pagePermission("candidatos:editar");
  if (!allowed) return <Forbidden message="Los vencimientos de credenciales no están disponibles para su rol." />;
  const result = await listExpiringCredentials(60);
  return (
    <>
      <PageHeader title="Vencimientos de credenciales" description="Licencias, carnés y certificaciones vencidas o que vencen en los próximos 60 días (de los candidatos que usted puede ver)." />
      <DataTable
        caption="Credenciales por vencer"
        rows={result.data.map((r) => ({ ...r, id: r.credential_id }))}
        error={result.error}
        emptyTitle="Sin vencimientos próximos"
        emptyDescription="No hay credenciales vencidas ni por vencer en 60 días."
        columns={[
          {
            header: "Candidato",
            cell: (r) => (
              <Link href={`/candidatos/${r.candidate_id}`} className="font-semibold hover:text-brand-600 hover:underline">
                {r.candidate_name}
              </Link>
            ),
          },
          { header: "Credencial", cell: (r) => r.credential },
          { header: "Vence", cell: (r) => formatDate(r.expires_on) },
          {
            header: "Estado",
            cell: (r) => <Badge def={r.days_left < 0 ? { label: `Vencida hace ${-r.days_left} día(s)`, tone: "red" } : { label: `Vence en ${r.days_left} día(s)`, tone: "warning" }} />,
          },
        ]}
      />
    </>
  );
}
