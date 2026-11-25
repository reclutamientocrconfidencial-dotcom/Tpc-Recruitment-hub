import type { Metadata } from "next";
import Link from "next/link";
import { Copy, Upload } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { CreateButton } from "@/components/ui/create-button";
import { FilterBar } from "@/components/ui/filter-bar";
import { Field, SelectInput, TextInput } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { Flash } from "@/components/ui/flash";
import { buttonClasses } from "@/components/ui/button";
import { searchCandidates } from "@/modules/candidates/repository";
import { candidateFilterParams, hasCandidateFilters, parseCandidateFilters } from "@/modules/candidates/filters";
import { searchByContactAction } from "@/modules/candidates/actions";
import { ContactSearch } from "@/modules/candidates/contact-search";
import { listJobPositions } from "@/modules/catalogs/repository";
import { listIntakeChannels } from "@/modules/config/repository";
import { listAssignableUsers } from "@/modules/common/options";
import { CANDIDATE_STATUS, optionsFrom } from "@/modules/labels";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { param, type RawSearchParams } from "@/lib/search-params";
import { CR_PROVINCES, ENGLISH_LEVELS } from "@/types/database";

export const metadata: Metadata = { title: "Candidatos" };

export default async function CandidatosPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const filters = parseCandidateFilters(sp);
  const [user, result, positions, channels, users] = await Promise.all([
    requireSessionUser(),
    searchCandidates(filters),
    listJobPositions(),
    listIntakeChannels(),
    listAssignableUsers(),
  ]);
  const active = hasCandidateFilters(filters);
  const manager = user.role === "admin" || user.role === "coordinador";

  return (
    <>
      <PageHeader
        title="Candidatos"
        description="Base madre de candidatos (banco de talento). Datos personales protegidos por la Ley 8968."
        actions={
          <>
            {manager ? (
              <>
                <Link href="/candidatos/duplicados" className={buttonClasses("secondary")}>
                  <Copy className="h-4 w-4" aria-hidden /> Duplicados
                </Link>
                <Link href="/candidatos/importar" className={buttonClasses("secondary")}>
                  <Upload className="h-4 w-4" aria-hidden /> Importar
                </Link>
              </>
            ) : null}
            <CreateButton label="Nuevo candidato" allowed={can(user.role, "candidatos:crear")} href="/candidatos/nuevo" />
          </>
        }
      />
      <Flash code={param(sp, "ok")} />

      {can(user.role, "candidatos:editar") ? <ContactSearch action={searchByContactAction} /> : null}

      <FilterBar path="/candidatos" active={active}>
        <Field id="q" label="Nombre">
          <TextInput id="q" type="search" defaultValue={filters.q} placeholder="Nombre o apellidos" />
        </Field>
        <Field id="perfil" label="Perfil profesional">
          <SelectInput id="perfil" defaultValue={filters.positionId} placeholder="Todos" options={positions.data.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        <Field id="provincia" label="Provincia">
          <SelectInput id="provincia" defaultValue={filters.province} placeholder="Todas" options={CR_PROVINCES.map((p) => ({ value: p, label: p }))} />
        </Field>
        <Field id="canton" label="Cantón">
          <TextInput id="canton" defaultValue={filters.canton} placeholder="Ej.: Escazú" />
        </Field>
        <Field id="fuente" label="Fuente">
          <SelectInput id="fuente" defaultValue={filters.channelId} placeholder="Todas" options={channels.data.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
        <Field id="ingles" label="Inglés">
          <SelectInput id="ingles" defaultValue={filters.english} placeholder="Cualquiera" options={ENGLISH_LEVELS.map((l) => ({ value: l, label: l }))} />
        </Field>
        <Field id="experiencia" label="Experiencia mínima (años)">
          <TextInput id="experiencia" type="number" min={0} max={70} defaultValue={filters.minYears == null ? "" : String(filters.minYears)} />
        </Field>
        <Field id="estado" label="Estado">
          <SelectInput id="estado" defaultValue={filters.status} placeholder="Activos y otros" options={optionsFrom(CANDIDATE_STATUS)} />
        </Field>
        <Field id="responsable" label="Responsable">
          <SelectInput id="responsable" defaultValue={filters.ownerId} placeholder="Todos" options={users.data.map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
        </Field>
      </FilterBar>

      <DataTable
        caption="Listado de candidatos"
        rows={result.rows}
        error={result.error}
        emptyTitle={active ? "Sin resultados" : "Sin candidatos"}
        emptyDescription={active ? "Ningún candidato coincide con los filtros." : "Registre o importe candidatos para formar el banco de talento."}
        columns={[
          {
            header: "Candidato",
            cell: (c) => (
              <Link href={`/candidatos/${c.id}`} className="font-semibold text-ink-950 hover:text-brand-600 hover:underline">
                {c.first_name} {c.last_name}
              </Link>
            ),
          },
          {
            header: "Perfiles",
            cell: (c) => {
              const list = (c.profiles ?? []).filter((p) => p.position).sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
              return list.length ? list.map((p) => p.position!.name).join(" · ") : (c.current_title ?? "—");
            },
          },
          { header: "Ubicación", cell: (c) => [c.canton, c.province].filter(Boolean).join(", ") || "—" },
          { header: "Experiencia", cell: (c) => (c.years_experience != null ? `${c.years_experience} años` : "—") },
          { header: "Fuente", cell: (c) => c.channel?.name ?? c.source ?? "—" },
          { header: "Estado", cell: (c) => <Badge def={CANDIDATE_STATUS[c.status ?? "activo"]} /> },
        ]}
      />
      {!result.error && result.total > 0 ? (
        <Pagination path="/candidatos" params={candidateFilterParams(filters)} page={result.page} total={result.total} pageSize={result.pageSize} />
      ) : null}
    </>
  );
}
