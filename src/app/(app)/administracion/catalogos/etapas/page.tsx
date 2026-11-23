import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listStageCatalog } from "@/modules/catalogs/repository";
import { createStageCatalogAction } from "@/modules/catalogs/actions";
import { StageQuickForm } from "@/modules/config/stage-quick-form";
import { StatusText, ToggleCatalogButton } from "@/modules/catalogs/toggle-button";
import { STAGE_CATEGORY, STAGE_TYPE } from "@/modules/labels";
import { pagePermission } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Catálogo de etapas" };

export default async function EtapasPage() {
  const { allowed } = await pagePermission("configuracion:gestionar");
  if (!allowed) return <Forbidden />;
  const stages = await listStageCatalog();
  return (
    <>
      <PageHeader title="Catálogo de etapas" description="Al usar una etapa en un proceso, su categoría y tipo se asignan automáticamente." />
      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-base font-semibold">Agregar etapa</h2>
        <StageQuickForm action={createStageCatalogAction} />
      </Card>
      <DataTable
        caption="Etapas del catálogo"
        rows={stages.data}
        error={stages.error}
        emptyTitle="Sin etapas"
        columns={[
          { header: "Etapa", cell: (s) => <span className={`font-semibold ${s.is_active ? "text-ink-950" : "text-neutral-400"}`}>{s.name}</span> },
          { header: "Categoría", cell: (s) => <Badge def={STAGE_CATEGORY[s.category]} /> },
          { header: "Tipo", cell: (s) => STAGE_TYPE[s.stage_type] },
          { header: "Plazo sugerido", cell: (s) => (s.default_target_days == null ? "—" : `${s.default_target_days} días`) },
          { header: "Estado", cell: (s) => <StatusText active={s.is_active} /> },
          { header: "Acción", cell: (s) => <ToggleCatalogButton table="stage_catalog" id={s.id} active={s.is_active} label={`etapa ${s.name}`} /> },
        ]}
      />
    </>
  );
}
