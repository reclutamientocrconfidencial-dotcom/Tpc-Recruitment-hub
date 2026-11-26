import "server-only";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { daysInStage } from "@/modules/applications/filters";
import type { ExpiringCredential, ProductivityRow, Task } from "@/types/database";

const TASK = "id, title, kind, due_at, status, notes, assigned_to, client_id, vacancy_id, application_id, completed_at, assignee:profiles!tasks_assigned_to_fkey(full_name), client:clients(name), vacancy:vacancies(code, title)";

type AppLite = {
  id: string;
  next_action: string | null;
  next_action_at: string | null;
  stage_changed_at: string;
  vacancy_id: string;
  candidate: { first_name: string; last_name: string } | null;
  vacancy: { code: string; title: string } | null;
  vstage: { name: string; category: string; target_days: number | null } | null;
};

export interface WorkdayItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  when?: string | null;
  overdue?: boolean;
}

export interface Workday {
  interviewsUpcoming: WorkdayItem[];
  interviewsWithoutResult: WorkdayItem[];
  tasks: Task[];
  teamOverdueTasks: Task[];
  nextActions: WorkdayItem[];
  stalled: WorkdayItem[];
  pendingAssessments: WorkdayItem[];
  pendingReports: WorkdayItem[];
  expiring: ExpiringCredential[];
  inboxPending: number;
  error: string | null;
}

const EMPTY: Workday = {
  interviewsUpcoming: [],
  interviewsWithoutResult: [],
  tasks: [],
  teamOverdueTasks: [],
  nextActions: [],
  stalled: [],
  pendingAssessments: [],
  pendingReports: [],
  expiring: [],
  inboxPending: 0,
  error: null,
};

const name = (a: AppLite) => `${a.candidate?.first_name ?? ""} ${a.candidate?.last_name ?? ""}`.trim();

/**
 * Pendientes del usuario. Todo pasa por RLS: cada persona solo ve lo que su
 * rol y sus asignaciones permiten.
 */
export async function getWorkday(userId: string, isManager: boolean, todayIso: string): Promise<Workday> {
  if (isDemoMode()) return EMPTY;
  try {
    const sb = await createSupabaseServerClient();
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86_400_000).toISOString();
    const [ivUp, ivPast, tasks, teamTasks, apps, expiring, inbox] = await Promise.all([
      sb.from("interviews").select("id, application_id, kind, scheduled_at, location, application:applications(candidate:candidates(first_name, last_name), vacancy:vacancies(code))").eq("interviewer_id", userId).eq("status", "programada").gte("scheduled_at", now.toISOString()).lte("scheduled_at", in7).order("scheduled_at").limit(50),
      sb.from("interviews").select("id, application_id, kind, scheduled_at, application:applications(candidate:candidates(first_name, last_name), vacancy:vacancies(code))").eq("interviewer_id", userId).eq("status", "programada").lt("scheduled_at", now.toISOString()).order("scheduled_at").limit(50),
      sb.from("tasks").select(TASK).eq("assigned_to", userId).eq("status", "pendiente").order("due_at").limit(100),
      isManager ? sb.from("tasks").select(TASK).neq("assigned_to", userId).eq("status", "pendiente").lt("due_at", now.toISOString()).order("due_at").limit(50) : Promise.resolve({ data: [], error: null }),
      sb.from("applications").select("id, next_action, next_action_at, stage_changed_at, vacancy_id, candidate:candidates(first_name, last_name), vacancy:vacancies(code, title), vstage:vacancy_stages!inner(name, category, target_days)").eq("recruiter_id", userId).in("vstage.category", ["nuevo", "en_proceso"]).limit(300),
      sb.rpc("expiring_credentials", { p_days: 30 }),
      sb.from("intake_submissions").select("id", { count: "exact", head: true }).eq("status", "revision"),
    ]);
    type Iv = { id: string; application_id: string; kind: string; scheduled_at: string; location?: string | null; application: { candidate: { first_name: string; last_name: string } | null; vacancy: { code: string } | null } | null };
    const ivItem = (i: Iv): WorkdayItem => ({
      id: i.id,
      title: `${i.application?.candidate?.first_name ?? ""} ${i.application?.candidate?.last_name ?? ""}`.trim(),
      detail: `${i.application?.vacancy?.code ?? ""}${i.location ? ` · ${i.location}` : ""}`,
      href: `/postulaciones/${i.application_id}/entrevistas/${i.id}`,
      when: i.scheduled_at,
    });
    const myApps = (apps.data ?? []) as unknown as AppLite[];
    const appIds = myApps.map((a) => a.id);
    const vacancyIds = [...new Set(myApps.map((a) => a.vacancy_id))];

    // Evaluaciones obligatorias sin resultado final e informes pendientes (postulaciones con entrevista realizada)
    const [required, results, doneInterviews, reports] = appIds.length
      ? await Promise.all([
          sb.from("vacancy_assessments").select("vacancy_id, assessment_type_id, type:assessment_types(name)").in("vacancy_id", vacancyIds).eq("requirement", "obligatoria"),
          sb.from("assessment_results").select("application_id, assessment_type_id, status").in("application_id", appIds),
          sb.from("interviews").select("application_id").in("application_id", appIds).eq("status", "realizada"),
          sb.from("executive_reports").select("application_id, status").in("application_id", appIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
    type Rq = { vacancy_id: string; assessment_type_id: string; type: { name: string } | null };
    type Rs = { application_id: string; assessment_type_id: string; status: string };
    const resultKey = new Set(((results.data ?? []) as Rs[]).filter((r) => r.status === "aprobada" || r.status === "reprobada" || r.status === "no_presento").map((r) => `${r.application_id}|${r.assessment_type_id}`));
    const requiredBy = new Map<string, Rq[]>();
    for (const r of (required.data ?? []) as unknown as Rq[]) requiredBy.set(r.vacancy_id, [...(requiredBy.get(r.vacancy_id) ?? []), r]);
    const pendingAssessments: WorkdayItem[] = [];
    for (const a of myApps) {
      const missing = (requiredBy.get(a.vacancy_id) ?? []).filter((r) => !resultKey.has(`${a.id}|${r.assessment_type_id}`));
      if (missing.length) pendingAssessments.push({ id: a.id, title: name(a), detail: `${a.vacancy?.code ?? ""} · ${missing.map((m) => m.type?.name).join(", ")}`, href: `/postulaciones/${a.id}` });
    }
    const interviewed = new Set(((doneInterviews.data ?? []) as Array<{ application_id: string }>).map((i) => i.application_id));
    const reportBy = new Map(((reports.data ?? []) as Array<{ application_id: string; status: string }>).map((r) => [r.application_id, r.status]));
    const pendingReports = myApps
      .filter((a) => interviewed.has(a.id) && reportBy.get(a.id) !== "final")
      .map((a) => ({ id: a.id, title: name(a), detail: `${a.vacancy?.code ?? ""} · ${reportBy.has(a.id) ? "informe en borrador" : "sin informe"}`, href: reportBy.has(a.id) ? `/postulaciones/${a.id}/informe` : `/postulaciones/${a.id}` }));

    return {
      interviewsUpcoming: ((ivUp.data ?? []) as unknown as Iv[]).map(ivItem),
      interviewsWithoutResult: ((ivPast.data ?? []) as unknown as Iv[]).map((i) => ({ ...ivItem(i), overdue: true })),
      tasks: (tasks.data ?? []) as unknown as Task[],
      teamOverdueTasks: (teamTasks.data ?? []) as unknown as Task[],
      nextActions: myApps
        .filter((a) => a.next_action_at && a.next_action_at <= todayIso)
        .sort((x, y) => (x.next_action_at ?? "").localeCompare(y.next_action_at ?? ""))
        .map((a) => ({ id: a.id, title: name(a), detail: `${a.vacancy?.code ?? ""} · ${a.next_action ?? "Próximo paso"}`, href: `/postulaciones/${a.id}`, when: a.next_action_at, overdue: (a.next_action_at ?? "") < todayIso })),
      stalled: myApps
        .filter((a) => a.vstage?.target_days != null && daysInStage(a.stage_changed_at, now) > a.vstage.target_days)
        .map((a) => ({ id: a.id, title: name(a), detail: `${a.vacancy?.code ?? ""} · ${a.vstage!.name}: ${daysInStage(a.stage_changed_at, now)} días (objetivo ${a.vstage!.target_days})`, href: `/postulaciones/${a.id}`, overdue: true })),
      pendingAssessments,
      pendingReports,
      expiring: (expiring.data ?? []) as ExpiringCredential[],
      inboxPending: inbox.count ?? 0,
      error: null,
    };
  } catch (err) {
    console.error("[workday]", err);
    return { ...EMPTY, error: "No fue posible cargar sus pendientes." };
  }
}

export async function getProductivity(from: string, to: string): Promise<{ rows: ProductivityRow[]; error: string | null }> {
  if (isDemoMode()) return { rows: [], error: null };
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("productivity_indicators", { p_from: from, p_to: to });
  if (error) return { rows: [], error: error.code === "22023" ? "Rango de fechas no válido (máximo un año)." : "No fue posible cargar los indicadores." };
  return { rows: (data ?? []) as ProductivityRow[], error: null };
}

export async function getCalendarStatus(): Promise<{ active: boolean; last_used: string | null }> {
  if (isDemoMode()) return { active: false, last_used: null };
  const sb = await createSupabaseServerClient();
  const { data } = await sb.rpc("calendar_status");
  return (data as { active: boolean; last_used: string | null } | null) ?? { active: false, last_used: null };
}
