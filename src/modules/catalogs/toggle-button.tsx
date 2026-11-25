import { toggleCatalogItemAction } from "@/modules/catalogs/actions";
import type { CatalogTable } from "@/modules/catalogs/schema";

/** Activar / desactivar un elemento de catálogo (nunca se borra). */
export function ToggleCatalogButton({ table, id, active, label }: { table: CatalogTable; id: string; active: boolean; label: string }) {
  return (
    <form action={toggleCatalogItemAction}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="is_active" value={active ? "false" : "true"} />
      <button type="submit" className="text-xs font-semibold text-brand-600 hover:underline" aria-label={`${active ? "Desactivar" : "Activar"} ${label}`}>
        {active ? "Desactivar" : "Activar"}
      </button>
    </form>
  );
}

export function StatusText({ active }: { active: boolean }) {
  return active ? (
    <span className="text-xs font-medium text-emerald-700">Activo</span>
  ) : (
    <span className="text-xs font-medium text-neutral-400">Inactivo</span>
  );
}
