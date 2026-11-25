import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { FilterBar } from "@/components/ui/filter-bar";
import { Field, SelectInput, TextInput } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { searchApplications } from "@/modules/applications/repository";
import { applicationFilterParams, daysInStage, hasApplicationFilters, parseApplicationFilters } from "@/modules/applications/filters";
import { listAssignableUsers } from "@/modules/common/options";
import { STAGE_CATEGORY, optionsFrom } from "@/modules/labels";
import { formatDate } from "@/lib/format";
import { type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Postulaciones" };

export default async function PostulacionesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const filters = parseApplicationFilters(await searchParams);
  const [result, users] = await Promise.all([searchApplications(filters), listAssignableUsers()]);
  const active = hasApplicationFilters(filters);
  return (
    <>
      <PageHeader title="Postulaciones" description="Candidatos en procesos activos. El tablero Kanban de cada vacante está en su ficha." />
      <FilterBar path="/postulaciones" active={active}>
        <Field id="q" label="Candidato">
          <TextInput id="q" type="search" defaultValue={filters.q} placeholder="Nombre o apellidos" />
        </Field>
        <Field id="etapa" label="Tipo de etapa">
          <SelectInput id="etapa" defaultValue={filters.category} placeholder="Todas" options={optionsFrom(STAGE_CATEGORY)} />
        </Field>
        <Field id="responsable" label="Responsable">
          <SelectInput id="responsable" defaultValue={filters.recruiterId} placeholder="Todos" options={users.data.map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink-950">
          <input type="checkbox" name="pendientes" value="1" defaultChecked={filters.pendingAction} className="h-4 w-4 accent-brand-600" />
          Próximo paso vencido o de hoy
        </label>
        {filters.vacancyId ? <input type="hidden" name="vacante" value={filters.vacancyId} /> : null}
      </FilterBar>
      <DataTable
        caption="Listado de postulaciones"
        rows={result.rows}
        error={result.error}
        emptyTitle={active ? "Sin resultados" : "Sin postulaciones"}
        emptyDescription="No hay postulaciones visibles para su usuario con esos filtros."
        columns={[
          {
            header: "Candidato",
            cell: (a) => (
              <Link href={`/postulaciones/${a.id}`} className="font-semibold text-ink-950 hover:text-brand-600 hover:underline">
                {a.candidate?.first_name} {a.candidate?.last_name}
              </Link>
            ),
          },
          {
            header: "Vacante",
            cell: (a) =>
              a.vacancy ? (
                <Link href={`/vacantes/${a.vacancy.id}/postulaciones`} className="hover:text-brand-600 hover:underline">
                  {a.vacancy.title} <span className="font-mono text-xs text-neutral-500">{a.vacancy.code}</span>
                </Link>
              ) : (
                "—"
              ),
          },
          { header: "Cliente", cell: (a) => a.vacancy?.requisition?.client?.name ?? "—" },
          { header: "Etapa", cell: (a) => (a.vstage ? <span className="inline-flex items-center gap-2">{a.vstage.name} <Badge def={STAGE_CATEGORY[a.vstage.category]} /></span> : "—") },
          { header: "Días en etapa", cell: (a) => daysInStage(a.stage_changed_at), className: "text-center" },
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
          { header: "Próximo paso", cell: (a) => (a.next_action ? `${a.next_action}${a.next_action_at ? ` · ${formatDate(a.next_action_at)}` : ""}` : "—") },
        ]}
      />
      {!result.error && result.total > 0 ? (
        <Pagination path="/postulaciones" params={applicationFilterParams(filters)} page={result.page} total={result.total} pageSize={result.pageSize} />
      ) : null}
    </>
  );
}
