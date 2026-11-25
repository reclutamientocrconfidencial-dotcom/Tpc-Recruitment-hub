import "server-only";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_PROFILE } from "@/lib/demo/data";
import { oneOf, param, sanitizeSearch, type RawSearchParams } from "@/lib/search-params";
import { pageRange, paginateArray, parsePage, PAGE_SIZE, type Paged } from "@/lib/pagination";
import { APP_ROLES, type AppRole, type Profile } from "@/types/database";

export interface UserFilters {
  q: string;
  role: AppRole | "";
  status: "activo" | "inactivo" | "";
  page: number;
}

export function parseUserFilters(sp: RawSearchParams): UserFilters {
  return {
    q: sanitizeSearch(param(sp, "q")),
    role: oneOf(param(sp, "rol"), APP_ROLES),
    status: oneOf(param(sp, "estado"), ["activo", "inactivo"] as const),
    page: parsePage(param(sp, "page")),
  };
}

export function userFilterParams(f: UserFilters): Record<string, string> {
  return { q: f.q, rol: f.role, estado: f.status };
}

const DEMO_USERS: Profile[] = [
  { ...DEMO_PROFILE, created_at: "2026-11-01T12:00:00Z" },
  { id: "aaaaaaaa-0000-4000-8000-000000000002", email: "coordinadora@tpc-demo.test", full_name: "Coordinadora Demo", role: "coordinador", is_active: true, created_at: "2026-11-02T12:00:00Z" },
  { id: "aaaaaaaa-0000-4000-8000-000000000003", email: "reclutador@tpc-demo.test", full_name: "Reclutador Demo", role: "reclutador", is_active: true, created_at: "2026-11-03T12:00:00Z" },
  { id: "aaaaaaaa-0000-4000-8000-000000000005", email: "consulta@tpc-demo.test", full_name: "Consulta Demo", role: "consulta", is_active: false, created_at: "2026-11-04T12:00:00Z" },
];

export async function searchUsers(f: UserFilters): Promise<Paged<Profile>> {
  if (isDemoMode()) {
    const q = f.q.toLowerCase();
    return paginateArray(
      DEMO_USERS.filter(
        (u) =>
          (!q || u.full_name.toLowerCase().includes(q) || u.email.includes(q)) &&
          (!f.role || u.role === f.role) &&
          (!f.status || u.is_active === (f.status === "activo")),
      ),
      f.page,
    );
  }
  try {
    const sb = await createSupabaseServerClient();
    let query = sb.from("profiles").select("id, email, full_name, role, is_active, created_at", { count: "exact" });
    if (f.q) query = query.or(`full_name.ilike.%${f.q}%,email.ilike.%${f.q}%`);
    if (f.role) query = query.eq("role", f.role);
    if (f.status) query = query.eq("is_active", f.status === "activo");
    const [from, to] = pageRange(f.page);
    const { data, error, count } = await query.order("full_name").order("email").range(from, to);
    if (error) {
      console.error("[users.search]", error.message);
      return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: "No fue posible cargar los usuarios." };
    }
    return { rows: (data ?? []) as Profile[], total: count ?? 0, page: f.page, pageSize: PAGE_SIZE, error: null };
  } catch (err) {
    console.error("[users.search]", err);
    return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: "No fue posible conectar con la base de datos." };
  }
}
