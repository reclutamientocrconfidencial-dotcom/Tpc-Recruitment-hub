import "server-only";
import { DEMO_CLIENTS, DEMO_REQUISITIONS, DEMO_VACANCIES } from "@/lib/demo/data";
import { DEFAULT_PAGE_SIZE, runQuery } from "@/modules/shared";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pageRange, paginateArray, PAGE_SIZE, type Paged } from "@/lib/pagination";
import type { ClientFilters } from "@/modules/clients/filters";
import type { Client, Profile, Requisition, Vacancy } from "@/types/database";

const LIST_COLUMNS = "id, name, legal_id, industry, status, contact_name, contact_email, contact_phone, province, created_at";
const DETAIL_COLUMNS = `${LIST_COLUMNS}, address, notes, account_manager_id, updated_at, account_manager:profiles!clients_account_manager_id_fkey(id, full_name)`;

/** Listado simple (dashboard y selectores). */
export function listClients() {
  return runQuery<Client>(
    () => DEMO_CLIENTS,
    (sb) => sb.from("clients").select(LIST_COLUMNS).order("name").limit(DEFAULT_PAGE_SIZE),
  );
}

function matches(c: Client, f: ClientFilters): boolean {
  const q = f.q.toLowerCase();
  return (
    (!q || c.name.toLowerCase().includes(q) || (c.legal_id ?? "").toLowerCase().includes(q)) &&
    (!f.status || c.status === f.status) &&
    (!f.province || c.province === f.province) &&
    (!f.industry || (c.industry ?? "").toLowerCase().includes(f.industry.toLowerCase()))
  );
}

/** Búsqueda, filtros y paginación en servidor (RLS aplica). */
export async function searchClients(f: ClientFilters): Promise<Paged<Client>> {
  if (isDemoMode()) return paginateArray(DEMO_CLIENTS.filter((c) => matches(c, f)), f.page);
  try {
    const sb = await createSupabaseServerClient();
    let query = sb.from("clients").select(LIST_COLUMNS, { count: "exact" });
    if (f.q) query = query.or(`name.ilike.%${f.q}%,legal_id.ilike.%${f.q}%`);
    if (f.status) query = query.eq("status", f.status);
    if (f.province) query = query.eq("province", f.province);
    if (f.industry) query = query.ilike("industry", `%${f.industry}%`);
    const [from, to] = pageRange(f.page);
    const { data, error, count } = await query.order("name").range(from, to);
    if (error) {
      console.error("[clients.search]", error.message);
      return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: "No fue posible cargar los clientes." };
    }
    return { rows: (data ?? []) as unknown as Client[], total: count ?? 0, page: f.page, pageSize: PAGE_SIZE, error: null };
  } catch (err) {
    console.error("[clients.search]", err);
    return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: "No fue posible conectar con la base de datos." };
  }
}

export async function getClient(id: string): Promise<Client | null> {
  if (isDemoMode()) return DEMO_CLIENTS.find((c) => c.id === id) ?? null;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("clients").select(DETAIL_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    console.error("[clients.get]", error.message);
    return null;
  }
  return data as unknown as Client | null;
}

export function listClientRequisitions(clientId: string) {
  return runQuery<Requisition>(
    () => DEMO_REQUISITIONS.filter((r) => r.client_id === clientId),
    (sb) =>
      sb
        .from("requisitions")
        .select("id, code, client_id, title, department, positions_count, priority, status, salary_min, salary_max, currency, target_date, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(20),
  );
}

export function listClientOpenVacancies(clientId: string) {
  return runQuery<Vacancy>(
    () => DEMO_VACANCIES.filter((v) => v.requisition?.client?.id === clientId && v.status === "abierta"),
    (sb) =>
      sb
        .from("vacancies")
        .select("id, code, requisition_id, title, province, modality, employment_type, status, openings, salary_min, salary_max, currency, published_at, closes_at, created_at, requisition:requisitions!inner(id, code, client_id)")
        .eq("requisition.client_id", clientId)
        .eq("status", "abierta")
        .order("published_at", { ascending: false })
        .limit(20),
  );
}

/** Gestores de cuenta posibles: admin y coordinadores activos. */
export function listAccountManagers() {
  return runQuery<Pick<Profile, "id" | "full_name" | "email">>(
    () => [{ id: "aaaaaaaa-0000-4000-8000-000000000001", full_name: "Usuaria Demo", email: "demo@tpc-demo.test" }],
    (sb) =>
      sb
        .from("profiles")
        .select("id, full_name, email")
        .eq("is_active", true)
        .in("role", ["admin", "coordinador"])
        .order("full_name")
        .limit(200),
  );
}
