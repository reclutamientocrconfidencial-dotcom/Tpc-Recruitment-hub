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
import { searchVacancies } from "@/modules/vacancies/repository";
import { hasVacancyFilters, parseVacancyFilters, vacancyFilterParams } from "@/modules/vacancies/filters";
import { listAssignableUsers, listClientOptions } from "@/modules/common/options";
import { CoverageBar } from "@/modules/common/coverage-bar";
import { PRIORITY, VACANCY_STATUS, WORK_MODALITY, optionsFrom } from "@/modules/labels";
import { isOverdue } from "@/modules/workflow";
import { formatDate } from "@/lib/format";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { param, type RawSearchParams } from "@/lib/search-params";
import { CR_PROVINCES } from "@/types/database";

export const metadata: Metadata = { title: "Vacantes" };

export default async function VacantesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const filters = parseVacancyFilters(sp);
  const [user, result, clients, users] = await Promise.all([requireSessionUser(), searchVacancies(filters), listClientOptions(), listAssignableUsers()]);
  const active = hasVacancyFilters(filters);

  return (
    <>
      <PageHeader
        title="Vacantes"
        description="Puestos publicados a partir de requisiciones aprobadas, con seguimiento de plazas."
        actions={<CreateButton label="Nueva vacante" allowed={can(user.role, "vacantes:crear")} href="/vacantes/nueva" />}
      />
      <Flash code={param(sp, "ok")} />

      <FilterBar path="/vacantes" active={active}>
        <Field id="q" label="Buscar">
          <TextInput id="q" type="search" defaultValue={filters.q} placeholder="Título o código" />
        </Field>
        <Field id="estado" label="Estado">
          <SelectInput id="estado" defaultValue={filters.status} placeholder="Todos" options={optionsFrom(VACANCY_STATUS)} />
        </Field>
        <Field id="prioridad" label="Prioridad">
          <SelectInput id="prioridad" defaultValue={filters.priority} placeholder="Todas" options={optionsFrom(PRIORITY)} />
        </Field>
        <Field id="modalidad" label="Modalidad">
          <SelectInput id="modalidad" defaultValue={filters.modality} placeholder="Todas" options={optionsFrom(WORK_MODALITY)} />
        </Field>
        <Field id="provincia" label="Provincia">
          <SelectInput id="provincia" defaultValue={filters.province} placeholder="Todas" options={CR_PROVINCES.map((p) => ({ value: p, label: p }))} />
        </Field>
        <Field id="cliente" label="Cliente">
          <SelectInput id="cliente" defaultValue={filters.clientId} placeholder="Todos" options={clients.data.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
        <Field id="responsable" label="Responsable">
          <SelectInput id="responsable" defaultValue={filters.recruiterId} placeholder="Todos" options={users.data.map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink-950">
          <input type="checkbox" name="pendientes" value="1" defaultChecked={filters.pending} className="h-4 w-4 accent-brand-600" />
          Solo con plazas pendientes
        </label>
      </FilterBar>

      <DataTable
        caption="Listado de vacantes"
        rows={result.rows}
        error={result.error}
        emptyTitle={active ? "Sin resultados" : "Sin vacantes"}
        emptyDescription={active ? "Ninguna vacante coincide con los filtros." : "No hay vacantes visibles para su usuario."}
        columns={[
          {
            header: "Vacante",
            cell: (v) => (
              <div>
                <Link href={`/vacantes/${v.id}`} className="font-semibold text-ink-950 hover:text-brand-600 hover:underline">
                  {v.title}
                </Link>
                <p className="font-mono text-xs text-neutral-500">{v.code}</p>
              </div>
            ),
          },
          { header: "Cliente", cell: (v) => v.requisition?.client?.name ?? "—" },
          { header: "Ubicación", cell: (v) => `${v.province ?? "—"} · ${WORK_MODALITY[v.modality]}` },
          { header: "Responsable", cell: (v) => v.recruiter?.full_name ?? "—" },
          { header: "Plazas", cell: (v) => <CoverageBar openings={v.openings} filled={v.filled_count ?? 0} compact /> },
          { header: "Prioridad", cell: (v) => (v.priority ? <Badge def={PRIORITY[v.priority]} /> : "—") },
          { header: "Estado", cell: (v) => <Badge def={VACANCY_STATUS[v.status]} /> },
          {
            header: "Fecha límite",
            cell: (v) =>
              ["abierta", "pausada", "borrador"].includes(v.status) && isOverdue(v.closes_at) ? (
                <span className="font-semibold text-brand-700">{formatDate(v.closes_at)} · vencida</span>
              ) : (
                formatDate(v.closes_at)
              ),
          },
        ]}
      />
      {!result.error && result.total > 0 ? (
        <Pagination path="/vacantes" params={vacancyFilterParams(filters)} page={result.page} total={result.total} pageSize={result.pageSize} />
      ) : null}
    </>
  );
}
