import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { Field, SelectInput, TextInput } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { searchJobPositions } from "@/modules/catalogs/repository";
import { createPositionAction } from "@/modules/catalogs/actions";
import { PositionForm } from "@/modules/catalogs/catalog-forms";
import { StatusText, ToggleCatalogButton } from "@/modules/catalogs/toggle-button";
import { pagePermission } from "@/lib/auth/guards";
import { parsePage } from "@/lib/pagination";
import { oneOf, param, sanitizeSearch, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Catálogo de puestos" };

export default async function PuestosPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { allowed } = await pagePermission("configuracion:gestionar");
  if (!allowed) return <Forbidden />;
  const sp = await searchParams;
  const q = sanitizeSearch(param(sp, "q"));
  const status = oneOf(param(sp, "estado"), ["activo", "inactivo"] as const);
  const page = parsePage(param(sp, "page"));
  const result = await searchJobPositions(q, status, page);
  return (
    <>
      <PageHeader title="Catálogo de puestos" description="Catálogo abierto: agregue los puestos que necesite. También se crean desde la configuración de procesos y requisitos." />
      <div className="mb-6"><PositionForm action={createPositionAction} /></div>
      <FilterBar path="/administracion/catalogos/puestos" active={Boolean(q || status)}>
        <Field id="q" label="Buscar" className="sm:col-span-2">
          <TextInput id="q" type="search" defaultValue={q} placeholder="Puesto o área" />
        </Field>
        <Field id="estado" label="Estado">
          <SelectInput id="estado" defaultValue={status} placeholder="Todos" options={[{ value: "activo", label: "Activos" }, { value: "inactivo", label: "Inactivos" }]} />
        </Field>
      </FilterBar>
      <DataTable
        caption="Puestos"
        rows={result.rows}
        error={result.error}
        emptyTitle="Sin puestos"
        emptyDescription="Ningún puesto coincide con la búsqueda."
        columns={[
          { header: "Puesto", cell: (p) => <span className={`font-semibold ${p.is_active ? "text-ink-950" : "text-neutral-400"}`}>{p.name}</span> },
          { header: "Área", cell: (p) => p.area ?? "—" },
          { header: "Estado", cell: (p) => <StatusText active={p.is_active} /> },
          { header: "Acción", cell: (p) => <ToggleCatalogButton table="job_positions" id={p.id} active={p.is_active} label={`puesto ${p.name}`} /> },
        ]}
      />
      {!result.error && result.total > 0 ? (
        <Pagination path="/administracion/catalogos/puestos" params={{ q, estado: status }} page={result.page} total={result.total} pageSize={result.pageSize} />
      ) : null}
    </>
  );
}
