import "server-only";
import { runQuery } from "@/modules/shared";
import { DEMO_CLIENTS, DEMO_PROFILE } from "@/lib/demo/data";
import type { Profile } from "@/types/database";

/** Responsables posibles: usuarios activos que no son de solo consulta. */
export function listAssignableUsers() {
  return runQuery<Pick<Profile, "id" | "full_name" | "email" | "role">>(
    () => [{ id: DEMO_PROFILE.id, full_name: DEMO_PROFILE.full_name, email: DEMO_PROFILE.email, role: DEMO_PROFILE.role }],
    (sb) =>
      sb
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("is_active", true)
        .in("role", ["admin", "coordinador", "reclutador"])
        .order("full_name")
        .limit(500),
  );
}

/** Clientes para seleccionar (los inactivos no se ofrecen). */
export function listClientOptions() {
  return runQuery<{ id: string; name: string; status: string }>(
    () => DEMO_CLIENTS.filter((c) => c.status !== "inactivo").map((c) => ({ id: c.id, name: c.name, status: c.status })),
    (sb) => sb.from("clients").select("id, name, status").neq("status", "inactivo").order("name").limit(2000),
  );
}

/** Todos los usuarios (incluidos consulta e inactivos), para mostrar autores en la bitácora. */
export function listAllUsers() {
  return runQuery<Pick<Profile, "id" | "full_name" | "email">>(
    () => [{ id: DEMO_PROFILE.id, full_name: DEMO_PROFILE.full_name, email: DEMO_PROFILE.email }],
    (sb) => sb.from("profiles").select("id, full_name, email").order("full_name").limit(2000),
  );
}
