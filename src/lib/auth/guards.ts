import "server-only";
import { can, type Permission } from "@/lib/auth/permissions";
import { getSessionUser, requireSessionUser, type SessionUser } from "@/lib/auth/session";

/**
 * Verificación de permisos para Server Actions. La base de datos (RLS) vuelve a
 * validar todo; esto evita viajes innecesarios y da mensajes claros.
 */
export async function authorizeAction(
  permission: Permission,
): Promise<{ user: SessionUser; error: null } | { user: null; error: string }> {
  const user = await getSessionUser();
  if (!user) return { user: null, error: "Su sesión expiró. Inicie sesión nuevamente." };
  if (!can(user.role, permission)) return { user: null, error: "No tiene permiso para realizar esta acción." };
  return { user, error: null };
}

/** Para páginas: devuelve el usuario y si tiene el permiso indicado. */
export async function pagePermission(permission: Permission): Promise<{ user: SessionUser; allowed: boolean }> {
  const user = await requireSessionUser();
  return { user, allowed: can(user.role, permission) };
}
