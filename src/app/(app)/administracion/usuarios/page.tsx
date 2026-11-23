import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { Field, SelectInput, TextInput } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { Alert } from "@/components/ui/alert";
import { parseUserFilters, searchUsers, userFilterParams } from "@/modules/users/repository";
import { updateUserAction } from "@/modules/users/actions";
import { UserRowForm } from "@/modules/users/user-row-form";
import { pagePermission } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import type { RawSearchParams } from "@/lib/search-params";
import { APP_ROLES } from "@/types/database";

export const metadata: Metadata = { title: "Usuarios y roles" };

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { user, allowed } = await pagePermission("usuarios:gestionar");
  if (!allowed) return <Forbidden message="Solo los administradores pueden gestionar usuarios." />;
  const filters = parseUserFilters(await searchParams);
  const result = await searchUsers(filters);
  const active = Boolean(filters.q || filters.role || filters.status);

  return (
    <>
      <PageHeader title="Usuarios y roles" description="Asigne roles y active o desactive cuentas internas." />
      <Alert className="mb-4" title="Creación de cuentas">
        Las cuentas nuevas se crean en el panel de Supabase (Authentication → Users) e inician con el rol «Consulta».
        Por seguridad, la aplicación nunca usa la clave secreta de Supabase.
      </Alert>
      <FilterBar path="/administracion/usuarios" active={active}>
        <Field id="q" label="Buscar" className="sm:col-span-2">
          <TextInput id="q" type="search" defaultValue={filters.q} placeholder="Nombre o correo" />
        </Field>
        <Field id="rol" label="Rol">
          <SelectInput id="rol" defaultValue={filters.role} placeholder="Todos" options={APP_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
        </Field>
        <Field id="estado" label="Estado">
          <SelectInput id="estado" defaultValue={filters.status} placeholder="Todos" options={[{ value: "activo", label: "Activos" }, { value: "inactivo", label: "Inactivos" }]} />
        </Field>
      </FilterBar>
      <DataTable
        caption="Usuarios del sistema"
        rows={result.rows}
        error={result.error}
        emptyTitle="Sin usuarios"
        emptyDescription="Ningún usuario coincide con los filtros."
        columns={[
          {
            header: "Usuario",
            cell: (u) => (
              <div>
                <p className="font-semibold text-ink-950">{u.email}{u.id === user.id ? <span className="ml-2 text-xs font-normal text-neutral-500">(usted)</span> : null}</p>
                <p className="text-xs text-neutral-500">Alta: {formatDate(u.created_at)}</p>
              </div>
            ),
          },
          { header: "Nombre · Rol · Estado", cell: (u) => <UserRowForm action={updateUserAction} user={u} isSelf={u.id === user.id} /> },
        ]}
      />
      {!result.error && result.total > 0 ? (
        <Pagination path="/administracion/usuarios" params={userFilterParams(filters)} page={result.page} total={result.total} pageSize={result.pageSize} />
      ) : null}
    </>
  );
}
