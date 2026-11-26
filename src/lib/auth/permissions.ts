import type { AppRole } from "@/types/database";

/**
 * Matriz de permisos de la interfaz. Refleja las políticas RLS de
 * supabase/migrations/20261121000400_rls_policies.sql.
 *
 * IMPORTANTE: esto solo controla qué se MUESTRA. La seguridad real la
 * aplica la base de datos mediante RLS.
 */
export const PERMISSIONS = [
  "dashboard:ver",
  "clientes:ver",
  "clientes:crear",
  "clientes:editar",
  "clientes:eliminar",
  "requisiciones:ver",
  "requisiciones:crear",
  "requisiciones:editar",
  "requisiciones:eliminar",
  "vacantes:ver",
  "vacantes:crear",
  "vacantes:editar",
  "vacantes:eliminar",
  "candidatos:ver",
  "candidatos:crear",
  "candidatos:editar",
  "candidatos:eliminar",
  "postulaciones:ver",
  "postulaciones:crear",
  "postulaciones:editar",
  "postulaciones:eliminar",
  "usuarios:gestionar",
  "auditoria:ver",
  "configuracion:gestionar",
  "fuentes:gestionar",
  "recepcion:ver",
  "formularios:gestionar",
  "plantillas:gestionar",
  "jornada:ver",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READ_ALL: Permission[] = [
  "dashboard:ver",
  "clientes:ver",
  "requisiciones:ver",
  "vacantes:ver",
  "candidatos:ver",
  "postulaciones:ver",
];

const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  coordinador: [
    ...READ_ALL,
    "clientes:crear",
    "clientes:editar",
    "requisiciones:crear",
    "requisiciones:editar",
    "vacantes:crear",
    "vacantes:editar",
    "candidatos:crear",
    "candidatos:editar",
    "postulaciones:crear",
    "postulaciones:editar",
    "configuracion:gestionar",
    "recepcion:ver",
    "formularios:gestionar",
    "jornada:ver",
  ],
  // Restringido además por asignación (RLS): solo registros propios/asignados.
  reclutador: [
    ...READ_ALL,
    "vacantes:editar",
    "candidatos:crear",
    "candidatos:editar",
    "postulaciones:crear",
    "postulaciones:editar",
    "recepcion:ver",
    "jornada:ver",
  ],
  // Sin acceso a la bandeja de recepción (contiene datos personales).
  consulta: READ_ALL,
};

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  coordinador: "Coordinador(a)",
  reclutador: "Reclutador(a)",
  consulta: "Consulta",
};

export function permissionsFor(role: AppRole | null | undefined): readonly Permission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role] ?? [];
}

export function can(role: AppRole | null | undefined, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}
