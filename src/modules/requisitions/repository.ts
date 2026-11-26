import "server-only";
import { DEMO_REQUISITIONS, DEMO_VACANCIES } from "@/lib/demo/data";
import { DEFAULT_PAGE_SIZE, runQuery } from "@/modules/shared";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pageRange, paginateArray, PAGE_SIZE, type Paged } from "@/lib/pagination";
import { isOverdue, REQUISITION_ACCEPTS_VACANCIES } from "@/modules/workflow";
import type { RequisitionFilters } from "@/modules/requisitions/filters";
import type { Requisition } from "@/types/database";

const COLUMNS =
  "id, code, client_id, title, department, positions_count, priority, status, salary_min, salary_max, currency, target_date, created_at, " +
  "position_id, work_schedule, province, modality, assigned_recruiter_id, " +
  "client:clients(id, name), position:job_positions(id, name), recruiter:profiles!requisitions_assigned_recruiter_id_fkey(id, full_name), " +
  "vacancies(id, openings, filled_count, status)";
const DETAIL = `${COLUMNS}, requested_by_name, justification, approved_at, approver:profiles!requisitions_approved_by_fkey(id, full_name)`;

const ACTIVE: Requisition["status"][] = ["borrador", "pendiente_aprobacion", "aprobada", "en_proceso"];

function demoRows(): Requisition[] {
  return DEMO_REQUISITIONS.map((r) => ({
    ...r,
    vacancies: DEMO_VACANCIES.filter((v) => v.requisition_id === r.id).map((v) => ({
      id: v.id,
      openings: v.openings,
      filled_count: v.filled_count ?? 0,
      status: v.status,
    })),
  }));
}

function matches(r: Requisition, f: RequisitionFilters): boolean {
  const q = f.q.toLowerCase();
  return (
    (!q || r.title.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)) &&
    (!f.status || r.status === f.status) &&
    (!f.priority || r.priority === f.priority) &&
    (!f.clientId || r.client_id === f.clientId) &&
    (!f.recruiterId || r.assigned_recruiter_id === f.recruiterId) &&
    (!f.overdue || (ACTIVE.includes(r.status) && isOverdue(r.target_date)))
  );
}

export async function searchRequisitions(f: RequisitionFilters): Promise<Paged<Requisition>> {
  if (isDemoMode()) return paginateArray(demoRows().filter((r) => matches(r, f)), f.page);
  try {
    const sb = await createSupabaseServerClient();
    let query = sb.from("requisitions").select(COLUMNS, { count: "exact" });
    if (f.q) query = query.or(`title.ilike.%${f.q}%,code.ilike.%${f.q}%`);
    if (f.status) query = query.eq("status", f.status);
    if (f.priority) query = query.eq("priority", f.priority);
    if (f.clientId) query = query.eq("client_id", f.clientId);
    if (f.recruiterId) query = query.eq("assigned_recruiter_id", f.recruiterId);
    if (f.overdue) {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
      query = query.in("status", ACTIVE).lt("target_date", today);
    }
    const [from, to] = pageRange(f.page);
    const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, to);
    if (error) {
      console.error("[requisitions.search]", error.message);
      return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: "No fue posible cargar las requisiciones." };
    }
    return { rows: (data ?? []) as unknown as Requisition[], total: count ?? 0, page: f.page, pageSize: PAGE_SIZE, error: null };
  } catch (err) {
    console.error("[requisitions.search]", err);
    return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: "No fue posible conectar con la base de datos." };
  }
}

export async function getRequisition(id: string): Promise<Requisition | null> {
  if (isDemoMode()) return demoRows().find((r) => r.id === id) ?? null;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("requisitions").select(DETAIL).eq("id", id).maybeSingle();
  if (error) {
    console.error("[requisitions.get]", error.message);
    return null;
  }
  return data as unknown as Requisition | null;
}

/** Requisiciones que admiten nuevas vacantes (aprobadas o en proceso). */
export function listRequisitionsForVacancies() {
  return runQuery<Pick<Requisition, "id" | "code" | "title" | "client_id" | "position_id" | "status"> & { client: { name: string } | null }>(
    () =>
      demoRows()
        .filter((r) => REQUISITION_ACCEPTS_VACANCIES.includes(r.status))
        .map((r) => ({ id: r.id, code: r.code, title: r.title, client_id: r.client_id, position_id: r.position_id ?? null, status: r.status, client: r.client ? { name: r.client.name } : null })),
    (sb) =>
      sb
        .from("requisitions")
        .select("id, code, title, client_id, position_id, status, client:clients(name)")
        .in("status", REQUISITION_ACCEPTS_VACANCIES)
        .order("created_at", { ascending: false })
        .limit(DEFAULT_PAGE_SIZE * 10),
  );
}
