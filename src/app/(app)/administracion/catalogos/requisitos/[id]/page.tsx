import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { getRequirementCatalogItem, listRequirementCatalogHistory, listScales } from "@/modules/catalogs/repository";
import { updateRequirementCatalogAction } from "@/modules/catalogs/actions";
import { RequirementEditForm } from "@/modules/catalogs/requirement-edit-form";
import { StatusText } from "@/modules/catalogs/toggle-button";
import { REQUIREMENT_CATEGORY } from "@/modules/labels";
import { pagePermission } from "@/lib/auth/guards";
import { isUuid } from "@/lib/ids";
import type { RequirementCatalogChange } from "@/types/database";

export const metadata: Metadata = { title: "Editar requisito" };

const DATE = new Intl.DateTimeFormat("es-CR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Costa_Rica" });

/** Lista legible de los cambios de una entrada del historial. */
function describe(h: RequirementCatalogChange, scaleName: (id: string | null) => string): string[] {
  const out: string[] = [];
  if (h.old_name !== h.new_name) out.push(`Nombre: «${h.old_name ?? "—"}» → «${h.new_name ?? "—"}»`);
  if (h.old_category !== h.new_category)
    out.push(`Categoría: ${h.old_category ? REQUIREMENT_CATEGORY[h.old_category] : "—"} → ${h.new_category ? REQUIREMENT_CATEGORY[h.new_category] : "—"}`);
  if (h.old_scale_id !== h.new_scale_id) out.push(`Escala: ${scaleName(h.old_scale_id)} → ${scaleName(h.new_scale_id)}`);
  if (h.old_description !== h.new_description) out.push("Descripción actualizada");
  if (h.old_is_active !== h.new_is_active) out.push(h.new_is_active ? "Activado" : "Desactivado");
  return out;
}

export default async function EditarRequisitoCatalogoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { allowed } = await pagePermission("configuracion:gestionar");
  if (!allowed) return <Forbidden message="Solo administración y coordinación pueden editar el catálogo de requisitos." />;
  const [found, scales, history] = await Promise.all([getRequirementCatalogItem(id), listScales(), listRequirementCatalogHistory(id)]);
  if (!found) notFound();
  const { item, usage, withLevel } = found;
  const names = new Map(scales.data.map((s) => [s.id, s.name]));
  const scaleName = (sid: string | null) => (sid ? (names.get(sid) ?? "Escala") : "Sin escala");

  return (
    <>
      <PageHeader title={`Editar: ${item.name}`} description="Los cambios de nombre y categoría se aplican a todos los requisitos configurados que lo usan." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Datos del requisito" action={<StatusText active={item.is_active} />} />
          <RequirementEditForm
            action={updateRequirementCatalogAction}
            item={item}
            scales={scales.data.map((s) => ({ id: s.id, name: s.name, is_active: s.is_active }))}
            scaleLocked={withLevel > 0}
            cancelHref="/administracion/catalogos/requisitos"
          />
        </Card>
        <Card>
          <CardHeader title="Uso" />
          <div className="space-y-2 px-5 py-5 text-sm">
            <p>
              <span className="font-semibold">{usage}</span> requisito(s) configurado(s) en clientes, puestos o vacantes.
            </p>
            <p>
              <span className="font-semibold">{withLevel}</span> con nivel mínimo exigido.
            </p>
            {withLevel > 0 ? (
              <Alert className="mt-2">Para cambiar la escala, quite primero el nivel mínimo de esos requisitos o cree un requisito nuevo.</Alert>
            ) : null}
            <p className="pt-2 text-xs text-neutral-500">Los requisitos del catálogo no se eliminan: se desactivan desde el listado.</p>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Historial de cambios" description="Registrado por la base de datos; no se puede modificar." />
        {history.error ? <p className="px-5 py-4 text-sm text-brand-700">{history.error}</p> : null}
        {history.data.length === 0 && !history.error ? <p className="px-5 py-8 text-center text-sm text-neutral-500">Sin cambios registrados.</p> : null}
        {history.data.length > 0 ? (
          <ol className="divide-y divide-neutral-100" aria-label="Historial de cambios">
            {history.data.map((h) => (
              <li key={h.id} className="px-5 py-3 text-sm">
                <p className="text-xs text-neutral-500">
                  {DATE.format(new Date(h.changed_at))} · {h.author?.full_name ?? "Sistema"}
                  {h.templates_updated > 0 ? ` · ${h.templates_updated} requisito(s) configurado(s) actualizado(s)` : ""}
                </p>
                <ul className="mt-1 list-disc pl-5 text-ink-950">
                  {describe(h, scaleName).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ) : null}
      </Card>
    </>
  );
}
