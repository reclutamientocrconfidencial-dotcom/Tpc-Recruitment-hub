import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { DataTable } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { Field, SelectInput, TextInput } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { pagePermission } from "@/lib/auth/guards";
import { param, type RawSearchParams } from "@/lib/search-params";
import { parsePage } from "@/lib/pagination";
import { isUuid } from "@/lib/ids";
import { cn } from "@/lib/cn";
import { listAllUsers } from "@/modules/common/options";
import { searchLogs, type LogFilters } from "@/modules/security/repository";

export const metadata: Metadata = { title: "Bitácora" };

const DATE = new Intl.DateTimeFormat("es-CR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Costa_Rica" });
const ACTION_LABEL: Record<string, string> = {
  INSERT: "Alta",
  UPDATE: "Cambio",
  DELETE: "Eliminación",
  ver_dato_sensible: "Consulta de dato sensible",
  descargar: "Descarga",
  exportar: "Exportación",
  importar: "Importación",
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function BitacoraPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { allowed } = await pagePermission("auditoria:ver");
  if (!allowed) return <Forbidden message="Solo administradores consultan la bitácora." />;
  const sp = await searchParams;
  const actor = param(sp, "usuario");
  const filters: LogFilters = {
    kind: param(sp, "tipo") === "accesos" ? "accesos" : "cambios",
    resource: param(sp, "recurso").replace(/[^a-z_]/g, "").slice(0, 60),
    actorId: isUuid(actor) ? actor : "",
    from: ISO.test(param(sp, "desde")) ? param(sp, "desde") : "",
    to: ISO.test(param(sp, "hasta")) ? param(sp, "hasta") : "",
    page: parsePage(param(sp, "page")),
  };
  const [result, users] = await Promise.all([searchLogs(filters), listAllUsers()]);
  const names = new Map(users.data.map((u) => [u.id, u.full_name || u.email]));
  const params = { tipo: filters.kind, recurso: filters.resource, usuario: filters.actorId, desde: filters.from, hasta: filters.to };
  const tab = (kind: LogFilters["kind"], label: string) => (
    <Link
      href={`/administracion/bitacora?tipo=${kind}`}
      aria-current={filters.kind === kind ? "page" : undefined}
      className={cn("rounded-lg px-4 py-2 text-sm font-semibold", filters.kind === kind ? "bg-ink-950 text-white" : "bg-white text-ink-950 hover:bg-neutral-100")}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title="Bitácora" description="Registro inalterable: quién hizo qué y cuándo. No contiene valores personales." />
      <nav className="mb-4 flex gap-2" aria-label="Tipo de registro">
        {tab("cambios", "Cambios en los datos")}
        {tab("accesos", "Accesos, descargas y exportaciones")}
      </nav>
      <FilterBar path="/administracion/bitacora" active={Boolean(filters.resource || filters.actorId || filters.from || filters.to)}>
        <input type="hidden" name="tipo" value={filters.kind} />
        <Field id="recurso" label={filters.kind === "cambios" ? "Tabla" : "Recurso"}>
          <TextInput id="recurso" defaultValue={filters.resource} placeholder={filters.kind === "cambios" ? "Ej.: vacancies" : "Ej.: candidatos"} />
        </Field>
        <Field id="usuario" label="Usuario">
          <SelectInput id="usuario" defaultValue={filters.actorId} placeholder="Todos" options={users.data.map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
        </Field>
        <Field id="desde" label="Desde">
          <TextInput id="desde" type="date" defaultValue={filters.from} />
        </Field>
        <Field id="hasta" label="Hasta">
          <TextInput id="hasta" type="date" defaultValue={filters.to} />
        </Field>
      </FilterBar>
      <DataTable
        caption={filters.kind === "cambios" ? "Bitácora de cambios" : "Registro de accesos"}
        rows={result.rows.map((r) => ({ ...r, id: String(r.id) }))}
        error={result.error}
        emptyTitle="Sin registros"
        emptyDescription="No hay registros con esos filtros."
        columns={[
          { header: "Fecha", cell: (r) => <span className="whitespace-nowrap text-xs">{DATE.format(new Date(r.created_at))}</span> },
          { header: "Usuario", cell: (r) => (r.actor_id ? (names.get(r.actor_id) ?? "Usuario") : "Sistema") },
          { header: "Acción", cell: (r) => ACTION_LABEL[r.action] ?? r.action },
          { header: filters.kind === "cambios" ? "Tabla" : "Recurso", cell: (r) => <span className="font-mono text-xs">{r.target}</span> },
          { header: "Registro", cell: (r) => <span className="font-mono text-xs">{r.record_id ? r.record_id.slice(0, 8) : "—"}</span> },
          { header: filters.kind === "cambios" ? "Campos modificados" : "Motivo", cell: (r) => <span className="text-xs">{r.detail || "—"}</span> },
        ]}
      />
      {!result.error && result.total > 0 ? (
        <Pagination path="/administracion/bitacora" params={params} page={result.page} total={result.total} pageSize={result.pageSize} />
      ) : null}
    </>
  );
}
