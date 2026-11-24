import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { DataTable } from "@/components/ui/data-table";
import { listRequirementCatalog, listScales } from "@/modules/catalogs/repository";
import { createRequirementCatalogAction } from "@/modules/catalogs/actions";
import { RequirementCatalogForm } from "@/modules/catalogs/catalog-forms";
import { StatusText, ToggleCatalogButton } from "@/modules/catalogs/toggle-button";
import { REQUIREMENT_CATEGORY } from "@/modules/labels";
import { pagePermission } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Catálogo de requisitos" };

export default async function RequisitosCatalogoPage() {
  const { allowed } = await pagePermission("configuracion:gestionar");
  if (!allowed) return <Forbidden />;
  const [reqs, scales] = await Promise.all([listRequirementCatalog(), listScales()]);
  const scaleName = new Map(scales.data.map((s) => [s.id, s.name]));
  return (
    <>
      <PageHeader title="Catálogo de requisitos" description="Requisitos reutilizables. La escala define los niveles de dominio que se pueden exigir." />
      <div className="mb-6">
        <RequirementCatalogForm action={createRequirementCatalogAction} scales={scales.data.filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.name }))} />
      </div>
      <DataTable
        caption="Requisitos del catálogo"
        rows={reqs.data}
        error={reqs.error}
        emptyTitle="Sin requisitos"
        columns={[
          {
            header: "Requisito",
            cell: (r) => (
              <Link
                href={`/administracion/catalogos/requisitos/${r.id}`}
                className={`font-semibold hover:text-brand-600 hover:underline ${r.is_active ? "text-ink-950" : "text-neutral-400"}`}
              >
                {r.name}
              </Link>
            ),
          },
          { header: "Categoría", cell: (r) => REQUIREMENT_CATEGORY[r.category] },
          { header: "Escala de dominio", cell: (r) => (r.scale_id ? scaleName.get(r.scale_id) ?? "—" : "Sin escala") },
          { header: "Estado", cell: (r) => <StatusText active={r.is_active} /> },
          {
            header: "Acción",
            cell: (r) => (
              <div className="flex items-center gap-3">
                <Link href={`/administracion/catalogos/requisitos/${r.id}`} className="text-xs font-semibold text-brand-600 hover:underline" aria-label={`Editar requisito ${r.name}`}>
                  Editar
                </Link>
                <ToggleCatalogButton table="requirement_catalog" id={r.id} active={r.is_active} label={`requisito ${r.name}`} />
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
