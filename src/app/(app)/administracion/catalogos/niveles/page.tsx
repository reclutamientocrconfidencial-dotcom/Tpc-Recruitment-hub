import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { listScales } from "@/modules/catalogs/repository";
import { addLevelAction, createScaleAction } from "@/modules/catalogs/actions";
import { AddLevelForm, ScaleForm } from "@/modules/catalogs/catalog-forms";
import { StatusText, ToggleCatalogButton } from "@/modules/catalogs/toggle-button";
import { pagePermission } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Niveles de dominio" };

export default async function NivelesPage() {
  const { allowed } = await pagePermission("configuracion:gestionar");
  if (!allowed) return <Forbidden />;
  const scales = await listScales();
  return (
    <>
      <PageHeader title="Niveles de dominio" description="Escalas configurables. Cada requisito del catálogo puede usar una escala para indicar el nivel mínimo exigido." />
      <div className="mb-6"><ScaleForm action={createScaleAction} /></div>
      {scales.error ? <Alert tone="error">{scales.error}</Alert> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {scales.data.map((s) => (
          <Card key={s.id} className={s.is_active ? "" : "opacity-70"}>
            <CardHeader
              title={s.name}
              description={s.description ?? undefined}
              action={
                <div className="flex items-center gap-3">
                  <StatusText active={s.is_active} />
                  <ToggleCatalogButton table="proficiency_scales" id={s.id} active={s.is_active} label={`escala ${s.name}`} />
                </div>
              }
            />
            <ol className="divide-y divide-neutral-100">
              {s.levels.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className={l.is_active ? "text-ink-950" : "text-neutral-400 line-through"}>
                    <span className="mr-2 font-mono text-xs text-neutral-400">{l.position}.</span>
                    {l.label}
                  </span>
                  <ToggleCatalogButton table="proficiency_levels" id={l.id} active={l.is_active} label={`nivel ${l.label} de ${s.name}`} />
                </li>
              ))}
            </ol>
            <div className="border-t border-neutral-100 px-5 py-3">
              <AddLevelForm action={addLevelAction} scaleId={s.id} scaleName={s.name} />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
