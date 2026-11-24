"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, fieldErrorsFrom, formValues, type ActionState } from "@/lib/action-state";
import { filledSchema, parseVacancyForm, type VacancyInput } from "@/modules/vacancies/schema";
import { resolveCatalogId } from "@/modules/catalogs/resolve";
import { canTransitionVacancy, committedOpenings, fitsAuthorized, REQUISITION_ACCEPTS_VACANCIES } from "@/modules/workflow";
import type { SupabaseServerClient } from "@/modules/shared";
import { VACANCY_STATUSES, type RequisitionStatus, type VacancyStatus } from "@/types/database";

const FULL_EDIT_ROLES = ["admin", "coordinador"];

async function toRow(sb: SupabaseServerClient, d: VacancyInput) {
  const position = await resolveCatalogId(sb, "job_positions", d.position_id, d.position_id_new);
  if (position.error) return { error: position.error };
  const { position_id_new: _drop, ...rest } = d;
  void _drop;
  return { row: { ...rest, position_id: position.id } };
}

/**
 * Plazas autorizadas: devuelve un mensaje si la vacante comprometería más plazas
 * de las disponibles en su requisición. La base de datos aplica la misma regla (0840).
 */
async function capacityError(
  sb: SupabaseServerClient,
  requisitionId: string,
  vacancyId: string | null,
  target: { status: VacancyStatus; openings: number; filled_count: number },
): Promise<string | null> {
  const required = committedOpenings(target);
  if (required === 0) return null;
  const [{ data: req }, { data: others }] = await Promise.all([
    sb.from("requisitions").select("positions_count").eq("id", requisitionId).maybeSingle(),
    sb.from("vacancies").select("id, status, openings, filled_count").eq("requisition_id", requisitionId),
  ]);
  if (!req) return null; // la BD decide
  const rest = ((others ?? []) as Array<{ id: string; status: VacancyStatus; openings: number; filled_count: number }>).filter((v) => v.id !== vacancyId);
  if (fitsAuthorized(req.positions_count as number, rest, required)) return null;
  const used = rest.reduce((n, v) => n + committedOpenings(v), 0);
  return `Plazas insuficientes en la requisición: autorizadas ${req.positions_count}, ya comprometidas en otras vacantes ${used}, esta vacante requiere ${required}. Ajuste las plazas de la vacante o amplíe la requisición.`;
}

function refresh(id?: string) {
  revalidatePath("/vacantes");
  revalidatePath("/requisiciones", "layout");
  if (id) revalidatePath(`/vacantes/${id}`);
}

/** Crea una vacante desde una requisición aprobada o en proceso (la BD lo exige). */
export async function createVacancyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("vacantes:crear");
  if (auth.error) return { error: auth.error, values: formValues(formData) };
  const requisitionId = z.uuid({ error: "Seleccione la requisición." }).safeParse(formData.get("requisition_id"));
  const parsed = parseVacancyForm(formData);
  if (!requisitionId.success || !parsed.success) {
    return {
      error: "Revise los campos marcados.",
      fieldErrors: { ...(parsed.success ? {} : fieldErrorsFrom(parsed.error)), ...(requisitionId.success ? {} : { requisition_id: "Seleccione la requisición." }) },
      values: formValues(formData),
    };
  }
  if (isDemoMode()) return { error: DEMO_READ_ONLY, values: formValues(formData) };

  const sb = await createSupabaseServerClient();
  const { data: req } = await sb.from("requisitions").select("id, status").eq("id", requisitionId.data).maybeSingle();
  if (!req) return { error: "La requisición no existe o no tiene acceso a ella.", values: formValues(formData) };
  if (!REQUISITION_ACCEPTS_VACANCIES.includes(req.status as RequisitionStatus)) {
    return { error: "Solo se pueden crear vacantes de requisiciones aprobadas o en proceso.", values: formValues(formData) };
  }
  const mapped = await toRow(sb, parsed.data);
  if ("error" in mapped) return { error: mapped.error, values: formValues(formData) };
  const publish = formData.get("publish_now") === "on";
  if (publish) {
    const msg = await capacityError(sb, requisitionId.data, null, { status: "abierta", openings: mapped.row.openings, filled_count: 0 });
    if (msg) return { error: msg, values: formValues(formData) };
  }
  const { data, error } = await sb
    .from("vacancies")
    .insert({ ...mapped.row, requisition_id: requisitionId.data, status: publish ? "abierta" : "borrador" })
    .select("id")
    .single();
  if (error) {
    console.warn("[vacancies.create]", error.code);
    return { error: dbErrorMessage(error), values: formValues(formData) };
  }
  if (formData.get("load_requirements") === "on") {
    const { error: e } = await sb.rpc("load_vacancy_requirements", { p_vacancy_id: data.id });
    if (e) console.warn("[vacancies.create.requirements]", e.code);
  }
  refresh();
  redirect(`/vacantes/${data.id}?ok=creado`);
}

/** Edición completa: solo administración y coordinación (la BD también lo exige). */
export async function updateVacancyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("vacantes:editar");
  if (auth.error) return { error: auth.error, values: formValues(formData) };
  if (!auth.user?.role || !FULL_EDIT_ROLES.includes(auth.user.role)) return { error: "Solo administración o coordinación puede modificar los datos de la vacante." };
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Vacante inválida." };
  const parsed = parseVacancyForm(formData);
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  if (isDemoMode()) return { error: DEMO_READ_ONLY, values: formValues(formData) };

  const sb = await createSupabaseServerClient();
  const mapped = await toRow(sb, parsed.data);
  if ("error" in mapped) return { error: mapped.error, values: formValues(formData) };
  const { data: current } = await sb.from("vacancies").select("requisition_id, status, openings, filled_count").eq("id", id.data).maybeSingle();
  if (current) {
    // Igual que la BD: solo se valida si la vacante compromete más plazas que antes.
    const status = current.status as VacancyStatus;
    const filled = current.filled_count as number;
    const target = { status, openings: mapped.row.openings, filled_count: filled };
    if (committedOpenings(target) > committedOpenings({ status, openings: current.openings as number, filled_count: filled })) {
      const msg = await capacityError(sb, current.requisition_id as string, id.data, target);
      if (msg) return { error: msg, values: formValues(formData) };
    }
  }
  const { data, error } = await sb.from("vacancies").update(mapped.row).eq("id", id.data).select("id");
  if (error) {
    console.warn("[vacancies.update]", error.code);
    return { error: dbErrorMessage(error), values: formValues(formData) };
  }
  if (!data || data.length === 0) return { error: "No tiene permiso para editar esta vacante o ya no existe." };
  refresh(id.data);
  redirect(`/vacantes/${id.data}?ok=actualizado`);
}

export async function changeVacancyStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("vacantes:editar");
  if (auth.error) return { error: auth.error };
  const id = z.uuid().safeParse(formData.get("id"));
  const status = z.enum(VACANCY_STATUSES).safeParse(formData.get("status"));
  if (!id.success || !status.success) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };

  const sb = await createSupabaseServerClient();
  const { data: current } = await sb.from("vacancies").select("status, requisition_id, openings, filled_count").eq("id", id.data).maybeSingle();
  if (!current) return { error: "La vacante no existe o no tiene acceso a ella." };
  if (!canTransitionVacancy(current.status as VacancyStatus, status.data)) return { error: "Cambio de estado no permitido." };
  const before = committedOpenings({ status: current.status as VacancyStatus, openings: current.openings as number, filled_count: current.filled_count as number });
  const target = { status: status.data, openings: current.openings as number, filled_count: current.filled_count as number };
  if (committedOpenings(target) > before) {
    const msg = await capacityError(sb, current.requisition_id as string, id.data, target);
    if (msg) return { error: msg };
  }
  const { data, error } = await sb.from("vacancies").update({ status: status.data }).eq("id", id.data).select("status");
  if (error) {
    console.warn("[vacancies.status]", error.code);
    return { error: dbErrorMessage(error) };
  }
  if (!data || data.length === 0) return { error: "No tiene permiso para cambiar el estado de esta vacante." };
  refresh(id.data);
  return { ok: true, message: "Estado actualizado." };
}

/** Plazas cubiertas (seguimiento). En 2D se calcularán desde las contrataciones. */
export async function updateFilledAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("vacantes:editar");
  if (auth.error) return { error: auth.error };
  const parsed = filledSchema.safeParse({ id: formData.get("id"), filled_count: formData.get("filled_count") });
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };

  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("vacancies").update({ filled_count: parsed.data.filled_count }).eq("id", parsed.data.id).select("status, filled_count, openings");
  if (error) {
    console.warn("[vacancies.filled]", error.code);
    return { error: error.code === "23514" ? "Las plazas cubiertas no pueden superar las plazas de la vacante." : dbErrorMessage(error), values: formValues(formData) };
  }
  if (!data || data.length === 0) return { error: "No tiene permiso para actualizar esta vacante." };
  refresh(parsed.data.id);
  const row = data[0]!;
  return { ok: true, message: row.status === "cubierta" ? "Todas las plazas están cubiertas: la vacante pasó a «Cubierta»." : "Plazas cubiertas actualizadas." };
}

/** Duplica una vacante (datos, proceso propio y requisitos) en la misma u otra requisición. */
export async function duplicateVacancyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("vacantes:crear");
  if (auth.error) return { error: auth.error };
  const id = z.uuid().safeParse(formData.get("id"));
  const target = z.union([z.uuid(), z.literal("")]).safeParse(String(formData.get("requisition_id") ?? ""));
  if (!id.success || !target.success) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };

  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("duplicate_vacancy", { p_vacancy_id: id.data, p_requisition_id: target.data || null });
  if (error) {
    console.warn("[vacancies.duplicate]", error.code);
    return {
      error: error.code === "23514" ? "La requisición de destino debe estar aprobada o en proceso. Elija otra requisición." : dbErrorMessage(error),
    };
  }
  refresh();
  redirect(`/vacantes/${data as string}/editar?ok=duplicado`);
}

/** Copia a la vacante los requisitos sugeridos (cliente+puesto, cliente, puesto, globales). */
export async function loadVacancyRequirementsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error) return { error: auth.error };
  const id = z.uuid().safeParse(formData.get("vacancy_id"));
  if (!id.success) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("load_vacancy_requirements", { p_vacancy_id: id.data });
  if (error) {
    console.warn("[vacancies.loadRequirements]", error.code);
    return { error: dbErrorMessage(error) };
  }
  refresh(id.data);
  const n = Number(data ?? 0);
  return { ok: true, message: n === 0 ? "No hay requisitos sugeridos nuevos." : `Se agregaron ${n} requisito(s) sugerido(s).` };
}

/** Crea un proceso propio de la vacante copiando el proceso heredado. */
export async function customizeVacancyProcessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error) return { error: auth.error };
  const id = z.uuid().safeParse(formData.get("vacancy_id"));
  if (!id.success) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };

  const sb = await createSupabaseServerClient();
  const { data: v } = await sb.from("vacancies").select("id, code, position_id, requisition:requisitions(client_id)").eq("id", id.data).maybeSingle();
  if (!v) return { error: "La vacante no existe o no tiene acceso a ella." };
  const clientId = (v.requisition as unknown as { client_id: string } | null)?.client_id ?? null;
  const { data: source, error: e1 } = await sb.rpc("resolve_pipeline_template", { p_client_id: clientId, p_position_id: v.position_id, p_vacancy_id: null });
  if (e1 || !source) return { error: "No se encontró un proceso base para copiar." };
  const { error } = await sb.rpc("duplicate_pipeline_template", {
    p_source_id: source as string,
    p_client_id: null,
    p_position_id: null,
    p_vacancy_id: id.data,
    p_name: `Proceso de ${v.code}`,
  });
  if (error) {
    console.warn("[vacancies.customizeProcess]", error.code);
    return { error: dbErrorMessage(error) };
  }
  refresh(id.data);
  return { ok: true, message: "Proceso propio creado. Ajuste las etapas y guarde." };
}
