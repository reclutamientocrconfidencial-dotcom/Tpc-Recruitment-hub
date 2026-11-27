import "server-only";
import { cache } from "react";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pageRange, PAGE_SIZE, type Paged } from "@/lib/pagination";
import { verifiedTotpFactors } from "@/modules/security/factors";

export interface MfaStatus {
  /** La organización exige verificación en dos pasos. */
  required: boolean;
  /** Nivel de la sesión actual: aal1 (contraseña) o aal2 (con código). */
  level: "aal1" | "aal2" | null;
  /** Factores TOTP verificados del usuario. */
  factors: Array<{ id: string; name: string; createdAt: string }>;
}

/** Estado de la verificación en dos pasos del usuario actual (por solicitud). */
export const getMfaStatus = cache(async (): Promise<MfaStatus> => {
  if (isDemoMode()) return { required: false, level: null, factors: [] };
  const sb = await createSupabaseServerClient();
  const [{ data: aal }, factors, { data: settings }] = await Promise.all([
    sb.auth.mfa.getAuthenticatorAssuranceLevel(),
    verifiedTotpFactors(sb),
    sb.from("security_settings").select("mfa_required").maybeSingle(),
  ]);
  return {
    required: Boolean(settings?.mfa_required),
    level: (aal?.currentLevel as MfaStatus["level"]) ?? null,
    factors: factors.map((f) => ({ id: f.id, name: (f.friendly_name ?? "Aplicación autenticadora").replace(/ [0-9a-z]+$/, ""), createdAt: f.created_at })),
  };
});

export interface UserSecurityRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  mfa_enabled: boolean;
}

/** Usuarios con su estado de verificación en dos pasos (solo admin; la BD lo exige). */
export async function listUsersSecurity(): Promise<{ data: UserSecurityRow[]; error: string | null }> {
  if (isDemoMode()) return { data: [], error: null };
  const sb = await createSupabaseServerClient();
  const [profiles, status] = await Promise.all([
    sb.from("profiles").select("id, full_name, email, role, is_active").order("full_name").limit(1000),
    sb.rpc("users_mfa_status"),
  ]);
  if (profiles.error || status.error) {
    console.error("[security.users]", profiles.error?.message ?? status.error?.message);
    return { data: [], error: "No fue posible cargar el estado de seguridad de los usuarios." };
  }
  const mfa = new Map(((status.data ?? []) as Array<{ user_id: string; mfa_enabled: boolean }>).map((r) => [r.user_id, r.mfa_enabled]));
  return {
    data: ((profiles.data ?? []) as Omit<UserSecurityRow, "mfa_enabled">[]).map((p) => ({ ...p, mfa_enabled: mfa.get(p.id) ?? false })),
    error: null,
  };
}

export interface LogFilters {
  kind: "cambios" | "accesos";
  resource: string;
  actorId: string;
  from: string;
  to: string;
  page: number;
}

export interface LogRow {
  id: number;
  created_at: string;
  actor_id: string | null;
  /** Tabla (cambios) o recurso (accesos). */
  target: string;
  record_id: string | null;
  /** INSERT/UPDATE/DELETE o la acción de acceso. */
  action: string;
  /** Campos modificados o motivo del acceso. */
  detail: string;
}

/** Bitácora de cambios o registro de accesos (solo admin; RLS). */
export async function searchLogs(f: LogFilters): Promise<Paged<LogRow>> {
  if (isDemoMode()) return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: null };
  try {
    const sb = await createSupabaseServerClient();
    const [from, to] = pageRange(f.page);
    const table = f.kind === "cambios" ? "audit_logs" : "access_logs";
    const targetCol = f.kind === "cambios" ? "table_name" : "resource";
    const cols = f.kind === "cambios" ? "id, created_at, actor_id, table_name, record_id, action, changed_fields" : "id, created_at, actor_id, resource, record_id, action, reason, item_count";
    let q = sb.from(table).select(cols, { count: "exact" });
    if (f.resource) q = q.eq(targetCol, f.resource);
    if (f.actorId) q = q.eq("actor_id", f.actorId);
    if (f.from) q = q.gte("created_at", `${f.from}T00:00:00-06:00`);
    if (f.to) q = q.lte("created_at", `${f.to}T23:59:59-06:00`);
    const { data, error, count } = await q.order("created_at", { ascending: false }).range(from, to);
    if (error) {
      console.error("[security.logs]", error.message);
      return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: "No fue posible cargar la bitácora." };
    }
    const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as number,
      created_at: r.created_at as string,
      actor_id: (r.actor_id as string | null) ?? null,
      target: String(r[targetCol] ?? ""),
      record_id: (r.record_id as string | null) ?? null,
      action: String(r.action ?? ""),
      detail:
        f.kind === "cambios"
          ? ((r.changed_fields as string[] | null) ?? []).join(", ")
          : [r.reason, r.item_count != null ? `${r.item_count} registro(s)` : null].filter(Boolean).join(" · "),
    }));
    return { rows, total: count ?? 0, page: f.page, pageSize: PAGE_SIZE, error: null };
  } catch (err) {
    console.error("[security.logs]", err);
    return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: "No fue posible conectar con la base de datos." };
  }
}

/** Registra un acceso sensible (consulta, descarga, exportación o importación). */
export async function logAccess(action: "ver_dato_sensible" | "descargar" | "exportar" | "importar", resource: string, recordId?: string | null, reason?: string | null, itemCount?: number | null) {
  if (isDemoMode()) return;
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("log_access", {
    p_action: action,
    p_resource: resource,
    p_record_id: recordId ?? null,
    p_reason: reason ?? null,
    p_item_count: itemCount ?? null,
  });
  if (error) console.error("[security.logAccess]", error.code);
}

/** Estado de la habilitación de datos reales y sus requisitos previos. */
export async function getRealDataStatus(): Promise<{ enabled: boolean; consentApproved: boolean }> {
  if (isDemoMode()) return { enabled: false, consentApproved: false };
  const sb = await createSupabaseServerClient();
  const [{ data: s }, { data: c }] = await Promise.all([
    sb.from("security_settings").select("real_data_enabled").maybeSingle(),
    sb.from("consent_texts").select("legal_approved").eq("is_active", true).maybeSingle(),
  ]);
  return { enabled: Boolean(s?.real_data_enabled), consentApproved: Boolean(c?.legal_approved) };
}
