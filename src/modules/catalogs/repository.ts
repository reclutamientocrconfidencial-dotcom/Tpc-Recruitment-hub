import "server-only";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runQuery } from "@/modules/shared";
import { pageRange, paginateArray, PAGE_SIZE, type Paged } from "@/lib/pagination";
import {
  DEMO_JOB_POSITIONS,
  DEMO_REQUIREMENT_CATALOG,
  DEMO_SCALES,
  DEMO_STAGE_CATALOG,
} from "@/lib/demo/catalogs";
import type {
  JobPosition,
  ProficiencyLevel,
  ProficiencyScale,
  RequirementCatalogChange,
  RequirementCatalogItem,
  StageCatalogItem,
} from "@/types/database";

export function listStageCatalog() {
  return runQuery<StageCatalogItem>(
    () => DEMO_STAGE_CATALOG,
    (sb) =>
      sb
        .from("stage_catalog")
        .select("id, name, category, stage_type, default_target_days, description, is_active, sort_order")
        .order("sort_order")
        .order("name"),
  );
}

/** Todos los puestos (para selectores con búsqueda). Límite defensivo. */
export function listJobPositions() {
  return runQuery<JobPosition>(
    () => DEMO_JOB_POSITIONS,
    (sb) => sb.from("job_positions").select("id, name, area, description, is_active").order("name").limit(2000),
  );
}

export async function searchJobPositions(q: string, status: "" | "activo" | "inactivo", page: number): Promise<Paged<JobPosition>> {
  if (isDemoMode()) {
    const t = q.toLowerCase();
    return paginateArray(
      DEMO_JOB_POSITIONS.filter(
        (p) => (!t || p.name.toLowerCase().includes(t) || (p.area ?? "").toLowerCase().includes(t)) && (!status || p.is_active === (status === "activo")),
      ),
      page,
    );
  }
  const sb = await createSupabaseServerClient();
  let query = sb.from("job_positions").select("id, name, area, description, is_active", { count: "exact" });
  if (q) query = query.or(`name.ilike.%${q}%,area.ilike.%${q}%`);
  if (status) query = query.eq("is_active", status === "activo");
  const [from, to] = pageRange(page);
  const { data, error, count } = await query.order("name").range(from, to);
  if (error) {
    console.error("[catalogs.positions]", error.message);
    return { rows: [], total: 0, page, pageSize: PAGE_SIZE, error: "No fue posible cargar los puestos." };
  }
  return { rows: (data ?? []) as JobPosition[], total: count ?? 0, page, pageSize: PAGE_SIZE, error: null };
}

export function listRequirementCatalog() {
  return runQuery<RequirementCatalogItem>(
    () => DEMO_REQUIREMENT_CATALOG,
    (sb) => sb.from("requirement_catalog").select("id, name, category, scale_id, description, is_active").order("name").limit(2000),
  );
}

export async function listScales(): Promise<{ data: ProficiencyScale[]; error: string | null }> {
  if (isDemoMode()) return { data: DEMO_SCALES, error: null };
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from("proficiency_scales")
    .select("id, name, description, is_active, levels:proficiency_levels(id, scale_id, position, label, is_active)")
    .order("name");
  if (error) {
    console.error("[catalogs.scales]", error.message);
    return { data: [], error: "No fue posible cargar las escalas." };
  }
  const scales = (data ?? []) as unknown as ProficiencyScale[];
  return {
    data: scales.map((s) => ({ ...s, levels: [...(s.levels ?? [])].sort((a: ProficiencyLevel, b: ProficiencyLevel) => a.position - b.position) })),
    error: null,
  };
}

/** Un requisito del catálogo, cuántos requisitos configurados lo usan y cuántos exigen nivel mínimo. */
export async function getRequirementCatalogItem(id: string): Promise<{ item: RequirementCatalogItem; usage: number; withLevel: number } | null> {
  if (isDemoMode()) {
    const item = DEMO_REQUIREMENT_CATALOG.find((r) => r.id === id);
    return item ? { item, usage: 0, withLevel: 0 } : null;
  }
  const sb = await createSupabaseServerClient();
  const [{ data, error }, usage, withLevel] = await Promise.all([
    sb.from("requirement_catalog").select("id, name, category, scale_id, description, is_active").eq("id", id).maybeSingle(),
    sb.from("requirement_templates").select("id", { count: "exact", head: true }).eq("catalog_requirement_id", id),
    sb.from("requirement_templates").select("id", { count: "exact", head: true }).eq("catalog_requirement_id", id).not("min_level_id", "is", null),
  ]);
  if (error) {
    console.error("[catalogs.requirement.get]", error.message);
    return null;
  }
  if (!data) return null;
  return { item: data as RequirementCatalogItem, usage: usage.count ?? 0, withLevel: withLevel.count ?? 0 };
}

/** Historial de cambios de un requisito del catálogo (solo admin y coordinación, RLS). */
export function listRequirementCatalogHistory(id: string) {
  return runQuery<RequirementCatalogChange>(
    () => [],
    (sb) =>
      sb
        .from("requirement_catalog_history")
        .select(
          "id, changed_at, old_name, new_name, old_category, new_category, old_scale_id, new_scale_id, old_description, new_description, old_is_active, new_is_active, templates_updated, author:profiles!requirement_catalog_history_changed_by_fkey(full_name)",
        )
        .eq("requirement_id", id)
        .order("changed_at", { ascending: false })
        .limit(100),
  );
}
