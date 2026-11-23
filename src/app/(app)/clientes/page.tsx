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
import { searchClients } from "@/modules/clients/repository";
import { clientFilterParams, hasActiveFilters, parseClientFilters } from "@/modules/clients/filters";
import { CLIENT_STATUS, optionsFrom } from "@/modules/labels";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { param, type RawSearchParams } from "@/lib/search-params";
import { CR_PROVINCES } from "@/types/database";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const filters = parseClientFilters(sp);
  const [user, result] = await Promise.all([requireSessionUser(), searchClients(filters)]);
  const params = clientFilterParams(filters);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Empresas para las que TPC gestiona procesos de reclutamiento."
        actions={<CreateButton label="Nuevo cliente" allowed={can(user.role, "clientes:crear")} href="/clientes/nuevo" />}
      />
      <Flash code={param(sp, "ok")} />

      <FilterBar path="/clientes" active={hasActiveFilters(filters)}>
        <Field id="q" label="Buscar" className="sm:col-span-2">
          <TextInput id="q" type="search" defaultValue={filters.q} placeholder="Nombre o cédula jurídica" />
        </Field>
        <Field id="estado" label="Estado">
          <SelectInput id="estado" defaultValue={filters.status} placeholder="Todos" options={optionsFrom(CLIENT_STATUS)} />
        </Field>
        <Field id="provincia" label="Provincia">
          <SelectInput id="provincia" defaultValue={filters.province} placeholder="Todas" options={CR_PROVINCES.map((p) => ({ value: p, label: p }))} />
        </Field>
        <Field id="industria" label="Industria">
          <TextInput id="industria" defaultValue={filters.industry} placeholder="Ej.: Comercio" />
        </Field>
      </FilterBar>

      <DataTable
        caption="Listado de clientes"
        rows={result.rows}
        error={result.error}
        emptyTitle={hasActiveFilters(filters) ? "Sin resultados" : "Sin clientes registrados"}
        emptyDescription={hasActiveFilters(filters) ? "Ningún cliente coincide con los filtros." : "Los clientes que registre aparecerán aquí."}
        columns={[
          {
            header: "Empresa",
            cell: (c) => (
              <Link href={`/clientes/${c.id}`} className="font-semibold text-ink-950 hover:text-brand-600 hover:underline">
                {c.name}
              </Link>
            ),
          },
          { header: "Cédula jurídica", cell: (c) => c.legal_id ?? "—" },
          { header: "Industria", cell: (c) => c.industry ?? "—" },
          { header: "Contacto", cell: (c) => c.contact_name ?? "—" },
          { header: "Provincia", cell: (c) => c.province ?? "—" },
          { header: "Estado", cell: (c) => <Badge def={CLIENT_STATUS[c.status]} /> },
        ]}
      />
      {!result.error && result.total > 0 ? (
        <Pagination path="/clientes" params={params} page={result.page} total={result.total} pageSize={result.pageSize} />
      ) : null}
    </>
  );
}
