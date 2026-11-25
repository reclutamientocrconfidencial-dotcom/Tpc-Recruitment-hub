import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { DataTable } from "@/components/ui/data-table";
import { listIntakeChannels } from "@/modules/config/repository";
import { createIntakeChannelAction, toggleIntakeChannelAction } from "@/modules/config/actions";
import { ChannelForm } from "@/modules/config/channel-form";
import { INTAKE_CATEGORY } from "@/modules/labels";
import { pagePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Fuentes de recepción" };

export default async function FuentesPage() {
  const { user, allowed } = await pagePermission("configuracion:gestionar");
  if (!allowed) return <Forbidden />;
  const canManage = can(user.role, "fuentes:gestionar");
  const channels = await listIntakeChannels();
  return (
    <>
      <PageHeader title="Fuentes de recepción" description="Canales por los que se reciben candidatos. Se registran en cada candidato y postulación." />
      {canManage ? <div className="mb-6"><ChannelForm action={createIntakeChannelAction} /></div> : null}
      <DataTable
        caption="Fuentes de recepción"
        rows={channels.data}
        error={channels.error}
        emptyTitle="Sin fuentes"
        columns={[
          { header: "Fuente", cell: (c) => <span className={`font-semibold ${c.is_active ? "text-ink-950" : "text-neutral-400 line-through"}`}>{c.name}</span> },
          { header: "Categoría", cell: (c) => INTAKE_CATEGORY[c.category] },
          { header: "Dato adicional", cell: (c) => c.detail_label ?? "—" },
          { header: "Estado", cell: (c) => (c.is_active ? "Activa" : "Inactiva") },
          {
            header: "Acción",
            cell: (c) =>
              canManage ? (
                <form action={toggleIntakeChannelAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="is_active" value={c.is_active ? "false" : "true"} />
                  <button type="submit" className="text-xs font-semibold text-brand-600 hover:underline" aria-label={`${c.is_active ? "Desactivar" : "Activar"} ${c.name}`}>
                    {c.is_active ? "Desactivar" : "Activar"}
                  </button>
                </form>
              ) : (
                "—"
              ),
          },
        ]}
      />
    </>
  );
}
