import "server-only";
import { dbErrorMessage } from "@/lib/db-errors";
import type { SupabaseServerClient } from "@/modules/shared";

/** Escapa comodines de LIKE para comparar nombres exactos sin distinguir mayúsculas. */
function likeExact(text: string) {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Devuelve el id de un elemento de catálogo existente (por id o por nombre
 * exacto) o lo crea. Así el catálogo crece sin duplicados. Los inactivos no se reutilizan.
 */
export async function resolveCatalogId(
  sb: SupabaseServerClient,
  table: "job_positions" | "requirement_catalog",
  id: string | null,
  newName: string | null,
  extra: Record<string, unknown> = {},
): Promise<{ id: string | null; error: string | null }> {
  if (id) return { id, error: null };
  if (!newName) return { id: null, error: null };
  const { data: existing } = await sb.from(table).select("id, is_active").ilike("name", likeExact(newName)).maybeSingle();
  if (existing) {
    if (!existing.is_active) return { id: null, error: `«${newName}» existe en el catálogo pero está inactivo. Actívelo primero.` };
    return { id: existing.id as string, error: null };
  }
  const { data, error } = await sb.from(table).insert({ name: newName, ...extra }).select("id").single();
  if (error) {
    console.warn(`[catalogs.resolve.${table}]`, error.code);
    return { id: null, error: dbErrorMessage(error) };
  }
  return { id: data.id as string, error: null };
}
