import "server-only";
import { DEMO_APPLICATIONS, DEMO_CANDIDATES, DEMO_GLOBAL_PIPELINE, DEMO_VACANCIES } from "@/lib/demo/data";
import { DEFAULT_PAGE_SIZE, runQuery } from "@/modules/shared";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pageRange, paginateArray, PAGE_SIZE, type Paged } from "@/lib/pagination";
import { normalizeName } from "@/modules/candidates/filters";
import type { ApplicationFilters } from "@/modules/applications/filters";
import type { Application, ApplicationEvent, ApplicationNote, VacancyStage } from "@/types/database";

const SELECT =
  "id, vacancy_id, candidate_id, stage, rating, applied_at, stage_changed_at, candidate:candidates(id, first_name, last_name), vacancy:vacancies(id, code, title)";

/** Listado breve (tablero de indicadores). */
export function listApplications(limit = DEFAULT_PAGE_SIZE) {
  return runQuery<Application>(
    () => DEMO_APPLICATIONS.slice(0, limit),
    (sb) => sb.from("applications").select(SELECT).order("stage_changed_at", { ascending: false }).limit(limit),
  );
}

const FULL =
  "id, vacancy_id, candidate_id, stage, stage_id, rating, applied_at, stage_changed_at, discard_reason, discard_note, next_action, next_action_at, hired_at, recruiter_id, " +
  "candidate:candidates!inner(id, first_name, last_name, full_name_norm), vacancy:vacancies(id, code, title, status, requisition:requisitions(client:clients(id, name))), " +
  "vstage:vacancy_stages(id, name, category, position, target_days), recruiter:profiles!applications_recruiter_id_fkey(id, full_name)";

function demoStages(vacancyId: string): VacancyStage[] {
  return DEMO_GLOBAL_PIPELINE.stages.map((s, i) => ({
    id: `99999999-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    vacancy_id: vacancyId,
    position: s.position,
    name: s.name,
    category: s.category,
    stage_type: s.stage_type,
    target_days: s.target_days ?? null,
    is_active: true,
  }));
}

function demoApps(): Application[] {
  return DEMO_APPLICATIONS.map((a) => {
    const stages = demoStages(a.vacancy_id);
    const st = stages.find((s) => (a.stage === "entrevista" ? s.stage_type === "entrevista" : a.stage === "preseleccion" ? s.category === "en_proceso" : s.category === "nuevo")) ?? stages[0]!;
    return { ...a, stage_id: st.id, vstage: st, vacancy: { ...(a.vacancy ?? { id: a.vacancy_id, code: "", title: "" }), status: "abierta" } };
  });
}

export async function searchApplications(f: ApplicationFilters): Promise<Paged<Application>> {
  if (isDemoMode()) {
    const q = normalizeName(f.q);
    return paginateArray(
      demoApps().filter(
        (a) =>
          (!q || normalizeName(`${a.candidate?.first_name} ${a.candidate?.last_name}`).includes(q)) &&
          (!f.vacancyId || a.vacancy_id === f.vacancyId) &&
          (!f.category || a.vstage?.category === f.category),
      ),
      f.page,
    );
  }
  try {
    const sb = await createSupabaseServerClient();
    const select = f.category ? FULL.replace("vstage:vacancy_stages(", "vstage:vacancy_stages!inner(") : FULL;
    let q = sb.from("applications").select(select, { count: "exact" });
    if (f.q) q = q.ilike("candidate.full_name_norm", `%${normalizeName(f.q)}%`);
    if (f.vacancyId) q = q.eq("vacancy_id", f.vacancyId);
    if (f.category) q = q.eq("vstage.category", f.category);
    if (f.recruiterId) q = q.eq("recruiter_id", f.recruiterId);
    if (f.pendingAction) q = q.not("next_action_at", "is", null).lte("next_action_at", new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date()));
    const [from, to] = pageRange(f.page);
    const { data, error, count } = await q.order("stage_changed_at", { ascending: false }).range(from, to);
    if (error) {
      console.error("[applications.search]", error.message);
      return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: "No fue posible cargar las postulaciones." };
    }
    return { rows: (data ?? []) as unknown as Application[], total: count ?? 0, page: f.page, pageSize: PAGE_SIZE, error: null };
  } catch (err) {
    console.error("[applications.search]", err);
    return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: "No fue posible conectar con la base de datos." };
  }
}

export interface Board {
  stages: VacancyStage[];
  /** true si las etapas aún no se fijaron (vista previa del proceso; se fijan con la primera postulación). */
  preview: boolean;
  applications: Application[];
  error: string | null;
}

/** Tablero Kanban de una vacante: etapas fijadas (o vista previa del proceso) y postulaciones. */
export async function getBoard(vacancyId: string, clientId: string | null, positionId: string | null): Promise<Board> {
  if (isDemoMode()) return { stages: demoStages(vacancyId), preview: false, applications: demoApps().filter((a) => a.vacancy_id === vacancyId), error: null };
  const sb = await createSupabaseServerClient();
  const [stages, apps] = await Promise.all([
    sb.from("vacancy_stages").select("id, vacancy_id, position, name, category, stage_type, target_days, is_active").eq("vacancy_id", vacancyId).order("position"),
    sb.from("applications").select(FULL).eq("vacancy_id", vacancyId).order("stage_changed_at", { ascending: true }).limit(1000),
  ]);
  if (stages.error || apps.error) {
    console.error("[applications.board]", stages.error?.message ?? apps.error?.message);
    return { stages: [], preview: false, applications: [], error: "No fue posible cargar el tablero." };
  }
  let list = (stages.data ?? []) as VacancyStage[];
  let preview = false;
  if (list.length === 0) {
    preview = true;
    const { data: tpl } = await sb.rpc("resolve_pipeline_template", { p_client_id: clientId, p_position_id: positionId, p_vacancy_id: vacancyId });
    if (tpl) {
      const { data } = await sb.from("pipeline_stages").select("id, position, name, category, stage_type, target_days").eq("template_id", tpl as string).order("position");
      list = ((data ?? []) as Array<Omit<VacancyStage, "vacancy_id" | "is_active">>).map((s) => ({ ...s, vacancy_id: vacancyId, is_active: true }));
    }
  }
  return { stages: list, preview, applications: (apps.data ?? []) as unknown as Application[], error: null };
}

export async function getApplication(id: string): Promise<Application | null> {
  if (isDemoMode()) return demoApps().find((a) => a.id === id) ?? null;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("applications").select(FULL).eq("id", id).maybeSingle();
  if (error) {
    console.error("[applications.get]", error.message);
    return null;
  }
  return data as unknown as Application | null;
}

export function listVacancyStages(vacancyId: string) {
  return runQuery<VacancyStage>(
    () => demoStages(vacancyId),
    (sb) => sb.from("vacancy_stages").select("id, vacancy_id, position, name, category, stage_type, target_days, is_active").eq("vacancy_id", vacancyId).eq("is_active", true).order("position"),
  );
}

export function listApplicationEvents(id: string) {
  return runQuery<ApplicationEvent>(
    () => [],
    (sb) =>
      sb
        .from("application_events")
        .select(
          "id, event_type, detail, created_at, from_stage:vacancy_stages!application_events_from_stage_id_fkey(name), to_stage:vacancy_stages!application_events_to_stage_id_fkey(name), actor:profiles!application_events_actor_id_fkey(full_name)",
        )
        .eq("application_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
  );
}

export function listApplicationNotes(id: string) {
  return runQuery<ApplicationNote>(
    () => [],
    (sb) =>
      sb
        .from("application_notes")
        .select("id, body, visibility, created_at, author:profiles!application_notes_author_id_fkey(full_name)")
        .eq("application_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
  );
}

export interface RequirementRow {
  id: string;
  requirement: string;
  requirement_type: "obligatorio" | "deseable";
  expected_level: string | null;
  scale_id: string | null;
  check: { status: "pendiente" | "cumple" | "no_cumple" | "no_aplica"; level_id: string | null; note: string | null; level?: { label: string } | null } | null;
}

/** Requisitos de la vacante con la evaluación de esta postulación. */
export async function listApplicationRequirements(applicationId: string, vacancyId: string): Promise<{ data: RequirementRow[]; error: string | null }> {
  if (isDemoMode()) return { data: [], error: null };
  const sb = await createSupabaseServerClient();
  const [reqs, checks] = await Promise.all([
    sb
      .from("requirement_templates")
      .select("id, requirement, requirement_type, expected_level, catalog:requirement_catalog(scale_id)")
      .eq("vacancy_id", vacancyId)
      .eq("is_active", true)
      .order("requirement_type")
      .order("requirement"),
    sb.from("application_requirement_checks").select("requirement_id, status, level_id, note, level:proficiency_levels(label)").eq("application_id", applicationId),
  ]);
  if (reqs.error || checks.error) return { data: [], error: "No fue posible cargar los requisitos." };
  const byReq = new Map(((checks.data ?? []) as unknown as Array<{ requirement_id: string } & NonNullable<RequirementRow["check"]>>).map((c) => [c.requirement_id, c]));
  return {
    data: ((reqs.data ?? []) as unknown as Array<{ id: string; requirement: string; requirement_type: "obligatorio" | "deseable"; expected_level: string | null; catalog: { scale_id: string | null } | null }>).map((r) => ({
      id: r.id,
      requirement: r.requirement,
      requirement_type: r.requirement_type,
      expected_level: r.expected_level,
      scale_id: r.catalog?.scale_id ?? null,
      check: byReq.get(r.id) ?? null,
    })),
    error: null,
  };
}

/** Candidatos que se pueden postular a la vacante (activos, con consentimiento y aún no postulados). */
export async function searchCandidatesForVacancy(vacancyId: string, q: string) {
  if (isDemoMode()) return DEMO_CANDIDATES.filter((c) => normalizeName(`${c.first_name} ${c.last_name}`).includes(normalizeName(q))).slice(0, 10).map((c) => ({ id: c.id, first_name: c.first_name, last_name: c.last_name, current_title: c.current_title }));
  if (normalizeName(q).length < 2) return [];
  const sb = await createSupabaseServerClient();
  const [{ data: cands }, { data: existing }] = await Promise.all([
    sb
      .from("candidates")
      .select("id, first_name, last_name, current_title")
      .ilike("full_name_norm", `%${normalizeName(q)}%`)
      .eq("status", "activo")
      .eq("consent_given", true)
      .order("last_name")
      .limit(25),
    sb.from("applications").select("candidate_id").eq("vacancy_id", vacancyId).limit(1000),
  ]);
  const taken = new Set(((existing ?? []) as Array<{ candidate_id: string }>).map((e) => e.candidate_id));
  return ((cands ?? []) as Array<{ id: string; first_name: string; last_name: string; current_title: string | null }>).filter((c) => !taken.has(c.id)).slice(0, 10);
}

/** Vacantes abiertas o pausadas a las que el candidato aún no está postulado. */
export async function listOpenVacanciesForCandidate(candidateId: string) {
  if (isDemoMode()) return DEMO_VACANCIES.filter((v) => v.status === "abierta").map((v) => ({ id: v.id, code: v.code, title: v.title }));
  const sb = await createSupabaseServerClient();
  const [{ data: vacs }, { data: apps }] = await Promise.all([
    sb.from("vacancies").select("id, code, title").in("status", ["abierta", "pausada"]).order("created_at", { ascending: false }).limit(200),
    sb.from("applications").select("vacancy_id").eq("candidate_id", candidateId),
  ]);
  const taken = new Set(((apps ?? []) as Array<{ vacancy_id: string }>).map((a) => a.vacancy_id));
  return ((vacs ?? []) as Array<{ id: string; code: string; title: string }>).filter((v) => !taken.has(v.id));
}
