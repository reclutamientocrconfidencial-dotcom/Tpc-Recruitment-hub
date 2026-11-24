import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { CreateButton } from "@/components/ui/create-button";
import { FilterBar } from "@/components/ui/filter-bar";
import { Field, SelectInput, TextInput } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { Flash } from "@/components/ui/flash";
import { searchRequisitions } from "@/modules/requisitions/repository";
import { hasRequisitionFilters, parseRequisitionFilters, requisitionFilterParams } from "@/modules/requisitions/filters";
import { listAssignableUsers, listClientOptions } from "@/modules/common/options";
import { CoverageBar } from "@/modules/common/coverage-bar";
import { PRIORITY, REQUISITION_STATUS, optionsFrom } from "@/modules/labels";
import { isOverdue, requisitionCoverage } from "@/modules/workflow";
import { formatDate } from "@/lib/format";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { param, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Requisiciones" };

const OPEN = ["borrador", "pendiente_aprobacion", "aprobada", "en_proceso"];

export default async function RequisicionesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const filters = parseRequisitionFilters(sp);
  const [user, result, clients, users] = await Promise.all([requireSessionUser(), searchRequisitions(filters), listClientOptions(), listAssignableUsers()]);
  const active = hasRequisitionFilters(filters);

  return (
    <>
      <PageHeader
        title="Requisiciones"
        description="Solicitudes de personal de los clientes, con flujo de aprobación."
        actions={<CreateButton label="Nueva requisición" allowed={can(user.role, "requisiciones:crear")} href="/requisiciones/nueva" />}
      />
      <Flash code={param(sp, "ok")} />

      <FilterBar path="/requisiciones" active={active}>
        <Field id="q" label="Buscar">
          <TextInput id="q" type="search" defaultValue={filters.q} placeholder="Título o código" />
        </Field>
        <Field id="estado" label="Estado">
          <SelectInput id="estado" defaultValue={filters.status} placeholder="Todos" options={optionsFrom(REQUISITION_STATUS)} />
        </Field>
        <Field id="prioridad" label="Prioridad">
          <SelectInput id="prioridad" defaultValue={filters.priority} placeholder="Todas" options={optionsFrom(PRIORITY)} />
        </Field>
        <Field id="cliente" label="Cliente">
          <SelectInput id="cliente" defaultValue={filters.clientId} placeholder="Todos" options={clients.data.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
        <Field id="responsable" label="Responsable">
          <SelectInput id="responsable" defaultValue={filters.recruiterId} placeholder="Todos" options={users.data.map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink-950">
          <input type="checkbox" name="vencidas" value="1" defaultChecked={filters.overdue} className="h-4 w-4 accent-brand-600" />
          Solo con fecha límite vencida
        </label>
      </FilterBar>

      <DataTable
        caption="Listado de requisiciones"
        rows={result.rows}
        error={result.error}
        emptyTitle={active ? "Sin resultados" : "Sin requisiciones"}
        emptyDescription={active ? "Ninguna requisición coincide con los filtros." : "No hay requisiciones visibles para su usuario."}
        columns={[
          {
            header: "Requisición",
            cell: (r) => (
              <div>
                <Link href={`/requisiciones/${r.id}`} className="font-semibold text-ink-950 hover:text-brand-600 hover:underline">
                  {r.title}
                </Link>
                <p className="font-mono text-xs text-neutral-500">{r.code}</p>
              </div>
            ),
          },
          { header: "Cliente", cell: (r) => r.client?.name ?? "—" },
          { header: "Responsable", cell: (r) => r.recruiter?.full_name ?? "—" },
          {
            header: "Plazas",
            cell: (r) => {
              // Avance sobre las plazas autorizadas; las vacantes en borrador no cuentan.
              const c = requisitionCoverage(r.positions_count, r.vacancies);
              return (
                <div>
                  <p className="text-xs text-neutral-600">{r.positions_count} autorizadas</p>
                  <CoverageBar openings={c.total} filled={c.filled} compact />
                </div>
              );
            },
          },
          { header: "Prioridad", cell: (r) => <Badge def={PRIORITY[r.priority]} /> },
          { header: "Estado", cell: (r) => <Badge def={REQUISITION_STATUS[r.status]} /> },
          {
            header: "Fecha límite",
            cell: (r) =>
              OPEN.includes(r.status) && isOverdue(r.target_date) ? (
                <span className="font-semibold text-brand-700">{formatDate(r.target_date)} · vencida</span>
              ) : (
                formatDate(r.target_date)
              ),
          },
        ]}
      />
      {!result.error && result.total > 0 ? (
        <Pagination path="/requisiciones" params={requisitionFilterParams(filters)} page={result.page} total={result.total} pageSize={result.pageSize} />
      ) : null}
    </>
  );
}
