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
