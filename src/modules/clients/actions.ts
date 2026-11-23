"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, fieldErrorsFrom, formValues, type ActionState } from "@/lib/action-state";
import { parseClientForm } from "@/modules/clients/schema";
import { CLIENT_STATUSES } from "@/types/database";

export async function createClientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("clientes:crear");
  if (auth.error) return { error: auth.error, values: formValues(formData) };

  const parsed = parseClientForm(formData);
  if (!parsed.success) {
    return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  }
  if (isDemoMode()) return { error: DEMO_READ_ONLY, values: formValues(formData) };

  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("clients").insert(parsed.data).select("id").single();
  if (error) {
    console.warn("[clients.create]", error.code);
    return { error: dbErrorMessage(error), values: formValues(formData) };
  }
  revalidatePath("/clientes");
  redirect(`/clientes/${data.id}?ok=creado`);
}

export async function updateClientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("clientes:editar");
  if (auth.error) return { error: auth.error, values: formValues(formData) };

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Cliente inválido." };

  const parsed = parseClientForm(formData);
  if (!parsed.success) {
    return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  }
  if (isDemoMode()) return { error: DEMO_READ_ONLY, values: formValues(formData) };

  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("clients").update(parsed.data).eq("id", id.data).select("id");
  if (error) {
    console.warn("[clients.update]", error.code);
    return { error: dbErrorMessage(error), values: formValues(formData) };
  }
  if (!data || data.length === 0) return { error: "No tiene permiso para editar este cliente o ya no existe." };
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id.data}`);
  redirect(`/clientes/${id.data}?ok=actualizado`);
}

/** Activar / desactivar (no se eliminan clientes: se conserva la trazabilidad). */
export async function setClientStatusAction(formData: FormData): Promise<void> {
  const auth = await authorizeAction("clientes:editar");
  const id = z.uuid().safeParse(formData.get("id"));
  const status = z.enum(CLIENT_STATUSES).safeParse(formData.get("status"));
  if (auth.error || !id.success || !status.success || isDemoMode()) {
    redirect(id.success ? `/clientes/${id.data}` : "/clientes");
  }
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("clients").update({ status: status.data }).eq("id", id.data);
  if (error) console.warn("[clients.status]", error.code);
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id.data}`);
  redirect(`/clientes/${id.data}?ok=${status.data === "inactivo" ? "desactivado" : "activado"}`);
}
