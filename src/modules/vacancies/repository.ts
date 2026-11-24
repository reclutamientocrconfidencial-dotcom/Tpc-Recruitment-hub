import "server-only";
import { DEMO_REQUISITIONS, DEMO_VACANCIES } from "@/lib/demo/data";
import { DEFAULT_PAGE_SIZE, runQuery } from "@/modules/shared";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pageRange, paginateArray, PAGE_SIZE, type Paged } from "@/lib/pagination";
import { getDefaultPipeline } from "@/modules/config/repository";
import { PENDING_STATUSES, type VacancyFilters } from "@/modules/vacancies/filters";
import type { PipelineStage, PipelineTemplate, RequirementTemplate, Vacancy } from "@/types/database";

/** Listado breve (dashboard). */
export function listVacancies() {
  return runQuery<Vacancy>(
    () => DEMO_VACANCIES,
    (sb) =>
      sb
        .from("vacancies")
        .select(
          "id, code, requisition_id, title, province, modality, employment_type, status, openings, salary_min, salary_max, currency, published_at, closes_at, created_at, requisition:requisitions(id, code, client:clients(id, name))",
        )
        .order("created_at", { ascending: false })
        .limit(DEFAULT_PAGE_SIZE),
  );
}

const BASE =
  "id, code, requisition_id, title, province, location_detail, modality, employment_type, status, openings, filled_count, priority, " +
  "salary_min, salary_max, currency, published_at, closes_at, created_at, position_id, work_schedule, recruiter_id, source_vacancy_id, " +
  "position:job_positions(id, name), recruiter:profiles!vacancies_recruiter_id_fkey(id, full_name)";
const REQ = "id, code, title, client_id, status, client:clients(id, name)";

function demoRows(): Vacancy[] {
  return DEMO_VACANCIES.map((v) => {
    const r = DEMO_REQUISITIONS.find((x) => x.id === v.requisition_id);
    return {
      ...v,
      filled_count: v.filled_count ?? 0,
      priority: v.priority ?? r?.priority ?? "media",
      requisition: r ? { id: r.id, code: r.code, client_id: r.client_id, status: r.status, client: r.client ?? null } : v.requisition,
    };
  });
}

function matches(v: Vacancy, f: VacancyFilters): boolean {
  const q = f.q.toLowerCase();
  return (
    (!q || v.title.toLowerCase().includes(q) || v.code.toLowerCase().includes(q)) &&
    (!f.status || v.status === f.status) &&
    (!f.priority || v.priority === f.priority) &&
    (!f.modality || v.modality === f.modality) &&
    (!f.province || v.province === f.province) &&
    (!f.clientId || v.requisition?.client_id === f.clientId) &&
    (!f.recruiterId || v.recruiter_id === f.recruiterId) &&
    (!f.pending || PENDING_STATUSES.includes(v.status))
  );
}

export async function searchVacancies(f: VacancyFilters): Promise<Paged<Vacancy>> {
  if (isDemoMode()) return paginateArray(demoRows().filter((v) => matches(v, f)), f.page);
  try {
    const sb = await createSupabaseServerClient();
    // !inner solo al filtrar por cliente: un reclutador puede ver una vacante publicada sin ver su requisición.
    const req = f.clientId ? `requisition:requisitions!inner(${REQ})` : `requisition:requisitions(${REQ})`;
    let query = sb.from("vacancies").select(`${BASE}, ${req}`, { count: "exact" });
    if (f.q) query = query.or(`title.ilike.%${f.q}%,code.ilike.%${f.q}%`);
    if (f.status) query = query.eq("status", f.status);
    if (f.priority) query = query.eq("priority", f.priority);
    if (f.modality) query = query.eq("modality", f.modality);
    if (f.province) query = query.eq("province", f.province);
    if (f.clientId) query = query.eq("requisition.client_id", f.clientId);
    if (f.recruiterId) query = query.eq("recruiter_id", f.recruiterId);
    if (f.pending) query = query.in("status", PENDING_STATUSES);
    const [from, to] = pageRange(f.page);
    const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) {
      console.error("[vacancies.search]", error.message);
      return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: "No fue posible cargar las vacantes." };
    }
    return { rows: (data ?? []) as unknown as Vacancy[], total: count ?? 0, page: f.page, pageSize: PAGE_SIZE, error: null };
  } catch (err) {
    console.error("[vacancies.search]", err);
    return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: "No fue posible conectar con la base de datos." };
  }
}

export async function getVacancy(id: string): Promise<Vacancy | null> {
  if (isDemoMode()) return demoRows().find((v) => v.id === id) ?? null;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("vacancies").select(`${BASE}, description, requisition:requisitions(${REQ}, position_id)`).eq("id", id).maybeSingle();
  if (error) {
    console.error("[vacancies.get]", error.message);
    return null;
  }
  return data as unknown as Vacancy | null;
}

export function listRequisitionVacancies(requisitionId: string) {
  return runQuery<Vacancy>(
    () => demoRows().filter((v) => v.requisition_id === requisitionId),
    (sb) => sb.from("vacancies").select(BASE).eq("requisition_id", requisitionId).order("created_at").limit(200),
  );
}

const TEMPLATE =
  "id, client_id, position_id, vacancy_id, name, description, is_default, stages:pipeline_stages(id, catalog_stage_id, position, name, category, stage_type, target_days)";

function sortStages(t: PipelineTemplate): PipelineTemplate {
  return { ...t, stages: [...(t.stages ?? [])].sort((a: PipelineStage, b: PipelineStage) => a.position - b.position) };
}

function scopeLabel(t: PipelineTemplate): string {
  if (t.vacancy_id) return "Proceso propio de la vacante";
  if (t.client_id && t.position_id) return "Proceso del cliente para este puesto";
  if (t.client_id) return "Proceso del cliente";
  if (t.position_id) return "Proceso estándar del puesto";
  return "Proceso estándar TPC";
}

/**
 * Proceso y requisitos de una vacante: el proceso propio (si existe) y el
 * heredado según la resolución vacante → cliente+puesto → cliente → puesto → estándar.
 */
export async function getVacancyConfiguration(vacancyId: string, clientId: string | null, positionId: string | null) {
  if (isDemoMode()) {
    const global = await getDefaultPipeline(null);
    return { own: null, inherited: global, inheritedLabel: "Proceso estándar TPC", requirements: { data: [] as RequirementTemplate[], error: null } };
  }
  const sb = await createSupabaseServerClient();
  const [ownRes, resolved, reqs] = await Promise.all([
    sb.from("pipeline_templates").select(TEMPLATE).eq("vacancy_id", vacancyId).eq("is_default", true).maybeSingle(),
    sb.rpc("resolve_pipeline_template", { p_client_id: clientId, p_position_id: positionId, p_vacancy_id: null }),
    sb
      .from("requirement_templates")
      .select("id, client_id, position_id, vacancy_id, catalog_requirement_id, min_level_id, position_title, requirement, requirement_type, category, expected_level, weight, is_active")
      .eq("vacancy_id", vacancyId)
      .order("requirement_type")
      .order("requirement")
      .limit(200),
  ]);
  if (ownRes.error) console.error("[vacancies.pipeline]", ownRes.error.message);
  if (resolved.error) console.error("[vacancies.resolve]", resolved.error.message);
  let inherited: PipelineTemplate | null = null;
  if (resolved.data) {
    const { data } = await sb.from("pipeline_templates").select(TEMPLATE).eq("id", resolved.data as string).maybeSingle();
    inherited = data ? sortStages(data as unknown as PipelineTemplate) : null;
  }
  if (reqs.error) console.error("[vacancies.requirements]", reqs.error.message);
  return {
    own: ownRes.data ? sortStages(ownRes.data as unknown as PipelineTemplate) : null,
    inherited,
    inheritedLabel: inherited ? scopeLabel(inherited) : "",
    requirements: {
      data: (reqs.data ?? []) as unknown as RequirementTemplate[],
      error: reqs.error ? "No fue posible cargar los requisitos." : null,
    },
  };
}
