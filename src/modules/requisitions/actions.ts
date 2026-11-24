"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, fieldErrorsFrom, formValues, type ActionState } from "@/lib/action-state";
import { parseRequisitionForm, type RequisitionInput } from "@/modules/requisitions/schema";
import { resolveCatalogId } from "@/modules/catalogs/resolve";
import { REQUISITION_STATUSES } from "@/types/database";

async function toRow(sb: Awaited<ReturnType<typeof createSupabaseServerClient>>, d: RequisitionInput) {
  const position = await resolveCatalogId(sb, "job_positions", d.position_id, d.position_id_new);
  if (position.error) return { error: position.error };
  const { position_id_new: _drop, ...rest } = d;
  void _drop;
  return { row: { ...rest, position_id: position.id } };
}

export async function createRequisitionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("requisiciones:crear");
  if (auth.error) return { error: auth.error, values: formValues(formData) };
  const parsed = parseRequisitionForm(formData);
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  if (isDemoMode()) return { error: DEMO_READ_ONLY, values: formValues(formData) };

  const sb = await createSupabaseServerClient();
  const mapped = await toRow(sb, parsed.data);
  if ("error" in mapped) return { error: mapped.error, values: formValues(formData) };
  const submit = formData.get("submit_for_approval") === "on";
  const { data, error } = await sb
    .from("requisitions")
    .insert({ ...mapped.row, status: submit ? "pendiente_aprobacion" : "borrador" })
    .select("id")
    .single();
  if (error) {
    console.warn("[requisitions.create]", error.code);
    return { error: dbErrorMessage(error), values: formValues(formData) };
  }
  revalidatePath("/requisiciones");
  redirect(`/requisiciones/${data.id}?ok=creado`);
}

export async function updateRequisitionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("requisiciones:editar");
  if (auth.error) return { error: auth.error, values: formValues(formData) };
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Requisición inválida." };
  const parsed = parseRequisitionForm(formData);
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  if (isDemoMode()) return { error: DEMO_READ_ONLY, values: formValues(formData) };

  const sb = await createSupabaseServerClient();
  const mapped = await toRow(sb, parsed.data);
  if ("error" in mapped) return { error: mapped.error, values: formValues(formData) };
  const { data, error } = await sb.from("requisitions").update(mapped.row).eq("id", id.data).select("id");
  if (error) {
    console.warn("[requisitions.update]", error.code);
    return { error: dbErrorMessage(error), values: formValues(formData) };
  }
  if (!data || data.length === 0) return { error: "No tiene permiso para editar esta requisición o ya no existe." };
  revalidatePath("/requisiciones");
  redirect(`/requisiciones/${id.data}?ok=actualizado`);
}

/** Cambio de estado. La base de datos valida la transición y registra la aprobación. */
export async function changeRequisitionStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("requisiciones:editar");
  if (auth.error) return { error: auth.error };
  const id = z.uuid().safeParse(formData.get("id"));
  const status = z.enum(REQUISITION_STATUSES).safeParse(formData.get("status"));
  if (!id.success || !status.success) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };

  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("requisitions").update({ status: status.data }).eq("id", id.data).select("status");
  if (error) {
    console.warn("[requisitions.status]", error.code);
    return { error: dbErrorMessage(error) };
  }
  if (!data || data.length === 0) return { error: "No tiene permiso para cambiar el estado de esta requisición." };
  revalidatePath("/requisiciones");
  revalidatePath(`/requisiciones/${id.data}`);
  return { ok: true, message: "Estado actualizado." };
}
