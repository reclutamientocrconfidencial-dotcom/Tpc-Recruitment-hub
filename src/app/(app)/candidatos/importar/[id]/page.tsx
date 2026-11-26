import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert } from "@/components/ui/alert";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/cn";
import { getImportBatch, importStatusCounts, listImportRows } from "@/modules/candidates/repository";
import { cancelImportAction, commitImportAction, revertImportAction, setImportDecisionAction } from "@/modules/candidates/import-actions";
import { BatchActionForm, DecisionForm } from "@/modules/candidates/import-forms";
import { requireSessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { oneOf, param, type RawSearchParams } from "@/lib/search-params";
import { parsePage } from "@/lib/pagination";

export const metadata: Metadata = { title: "Informe de importación" };

const ROW_STATUS = { valido: "Válidas", posible_duplicado: "Posibles duplicados", duplicado: "Duplicados (cédula)", error: "Con errores" } as const;
const DECISION = { crear: "Crear", actualizar: "Completar existente", omitir: "Omitir" } as const;

export default async function InformeImportacionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const user = await requireSessionUser();
  if (user.role !== "admin" && user.role !== "coordinador") return <Forbidden message="Solo administración y coordinación importan candidatos." />;
  const batch = await getImportBatch(id);
  if (!batch) notFound();
  const status = oneOf(param(sp, "estado"), ["valido", "posible_duplicado", "duplicado", "error"] as const);
  const page = parsePage(param(sp, "page"));
  const [counts, rows] = await Promise.all([importStatusCounts(id), listImportRows(id, status, page)]);
  const reviewing = batch.status === "validado";

  return (
    <>
      <PageHeader title={`Importación: ${batch.file_name}`} description={`${batch.row_count} filas · ${formatDate(batch.created_at)} · ${batch.creator?.full_name ?? ""}`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(ROW_STATUS) as Array<keyof typeof ROW_STATUS>).map((k) => (
          <Link
            key={k}
            href={`/candidatos/importar/${id}?estado=${k}`}
            aria-current={status === k ? "page" : undefined}
            className={cn("rounded-xl border bg-white p-4 shadow-sm hover:shadow-md", status === k ? "border-brand-600" : "border-neutral-200")}
          >
            <p className="text-2xl font-bold" data-testid={`conteo-${k}`}>
              {counts[k] ?? 0}
            </p>
            <p className="text-sm text-neutral-600">{ROW_STATUS[k]}</p>
          </Link>
        ))}
      </div>

      {batch.status === "importado" ? (
        <Alert className="mb-4">
          Importado el {formatDate(batch.committed_at)}: {batch.created_count} creados, {batch.updated_count} actualizados, {batch.skipped_count} omitidos. Los datos del archivo
          se eliminaron del lote.
        </Alert>
      ) : null}
      {batch.status === "cancelado" ? <Alert className="mb-4">Lote cancelado: no se importó nada y los datos del archivo se eliminaron.</Alert> : null}
      {batch.status === "revertido" ? <Alert className="mb-4">Lote revertido el {formatDate(batch.reverted_at)}: {batch.reverted_count} candidato(s) eliminados.</Alert> : null}

      {reviewing ? (
        <Card className="mb-6">
          <CardHeader title="Revisión humana" description="Decida qué hacer con cada posible duplicado. Las filas válidas se crearán; las de error y los duplicados por cédula se omiten salvo que indique completar el existente." />
          <div className="grid gap-6 px-5 py-5 sm:grid-cols-2">
            <div>
              {counts.sin_decision > 0 ? (
                <Alert tone="error" className="mb-3">
                  Faltan {counts.sin_decision} decisión(es). <Link className="font-semibold underline" href={`/candidatos/importar/${id}?estado=posible_duplicado`}>Revisar</Link>
                </Alert>
              ) : null}
              <BatchActionForm action={commitImportAction} batchId={id} label="Importar ahora" confirmText="¿Importar los candidatos según las decisiones tomadas?" />
            </div>
            <BatchActionForm action={cancelImportAction} batchId={id} label="Cancelar lote" variant="ghost" confirmText="¿Cancelar el lote? Se eliminarán los datos del archivo." />
          </div>
        </Card>
      ) : null}
      {batch.status === "importado" && user.role === "admin" ? (
        <Card className="mb-6">
          <CardHeader title="Revertir el lote" description="Elimina los candidatos creados por este lote que aún no tengan postulaciones. Queda registrado." />
          <div className="px-5 py-5 sm:max-w-md">
            <BatchActionForm action={revertImportAction} batchId={id} label="Revertir lote" withReason variant="secondary" confirmText="¿Revertir el lote? Esta acción elimina candidatos." />
          </div>
        </Card>
      ) : null}

      <DataTable
        caption="Filas del lote"
        rows={rows.rows.map((r) => ({ ...r, id: String(r.row_number) }))}
        error={rows.error}
        emptyTitle="Sin filas"
        columns={[
          { header: "Fila", cell: (r) => r.row_number },
          {
            header: "Candidato",
            cell: (r) => (r.result_candidate_id ? <Link className="font-semibold text-brand-700 hover:underline" href={`/candidatos/${r.result_candidate_id}`}>{r.full_name}</Link> : (r.full_name ?? "—")),
          },
          { header: "Estado", cell: (r) => ROW_STATUS[r.status] },
          {
            header: "Detalle",
            cell: (r) =>
              r.errors.length ? (
                <ul className="list-disc pl-4 text-xs text-brand-700">
                  {r.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : r.match_candidate_id ? (
                <span className="text-xs">
                  Coincide con{" "}
                  <Link target="_blank" className="font-semibold text-brand-700 hover:underline" href={`/candidatos/${r.match_candidate_id}`}>
                    {r.match ? `${r.match.first_name} ${r.match.last_name}` : "candidato existente"}
                  </Link>{" "}
                  en: {r.match_reasons.join(", ")}
                </span>
              ) : (
                "—"
              ),
          },
          {
            header: "Decisión",
            cell: (r) =>
              reviewing && (r.status === "posible_duplicado" || r.status === "duplicado") ? (
                <DecisionForm
                  action={setImportDecisionAction}
                  batchId={id}
                  row={r.row_number}
                  current={r.decision}
                  options={r.status === "duplicado" ? ["actualizar", "omitir"] : ["crear", "actualizar", "omitir"]}
                />
              ) : r.decision ? (
                DECISION[r.decision]
              ) : (
                "Pendiente"
              ),
          },
        ]}
      />
      {!rows.error && rows.total > 0 ? <Pagination path={`/candidatos/importar/${id}`} params={{ estado: status }} page={rows.page} total={rows.total} pageSize={rows.pageSize} /> : null}
    </>
  );
}
