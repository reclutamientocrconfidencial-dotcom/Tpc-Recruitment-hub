"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, fieldErrorsFrom, formValues, type ActionState } from "@/lib/action-state";
import { channelCode, intakeChannelSchema, parseStagesJson, requirementSchema } from "@/modules/config/schema";

const optionalUuid = z.union([z.uuid(), z.literal("")]).transform((v) => (v === "" ? null : v));

function configPath(clientId: string | null) {
  return clientId ? `/clientes/${clientId}/configuracion` : "/administracion/procesos";
}

/** Guarda las etapas de un proceso. Si el cliente no tiene proceso propio, lo crea. */
export async function savePipelineAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error) return { error: auth.error };

  const clientId = optionalUuid.safeParse(String(formData.get("client_id") ?? ""));
  const templateId = optionalUuid.safeParse(String(formData.get("template_id") ?? ""));
  if (!clientId.success || !templateId.success) return { error: "Datos inválidos." };

  const stages = parseStagesJson(formData.get("stages"));
  if (!stages.success) return { error: stages.message };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };

  const sb = await createSupabaseServerClient();
  let id = templateId.data;
  const isNew = !id;
  if (!id) {
    if (!clientId.data) return { error: "Proceso inválido." };
    // Se crea sin marcar como predeterminado hasta que las etapas se guarden bien.
    const { data, error } = await sb
      .from("pipeline_templates")
      .insert({ client_id: clientId.data, name: "Proceso del cliente", is_default: false })
      .select("id")
      .single();
    if (error) {
      console.warn("[config.pipeline.create]", error.code);
      return { error: dbErrorMessage(error) };
    }
    id = data.id as string;
  }

  const { error } = await sb.rpc("save_pipeline_stages", { p_template_id: id, p_stages: stages.data });
  if (error) {
    console.warn("[config.pipeline.save]", error.code);
    if (isNew) await sb.from("pipeline_templates").delete().eq("id", id);
    return { error: dbErrorMessage(error) };
  }
  if (isNew) {
    const { error: e } = await sb.from("pipeline_templates").update({ is_default: true }).eq("id", id);
    if (e) {
      console.warn("[config.pipeline.default]", e.code);
      return { error: dbErrorMessage(e) };
    }
  }
  revalidatePath(configPath(clientId.data));
  return { ok: true, message: "Proceso guardado correctamente." };
}

/** Vuelve a usar el proceso global (elimina el proceso propio del cliente). */
export async function resetClientPipelineAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error) return { error: auth.error };
  const clientId = z.uuid().safeParse(formData.get("client_id"));
  const templateId = z.uuid().safeParse(formData.get("template_id"));
  if (!clientId.success || !templateId.success) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };

  const sb = await createSupabaseServerClient();
  // Se desmarca como predeterminado y se elimina (la política impide borrar predeterminados).
  const { error: e1 } = await sb
    .from("pipeline_templates")
    .update({ is_default: false })
    .eq("id", templateId.data)
    .eq("client_id", clientId.data);
  const { error: e2 } = e1
    ? { error: e1 }
    : await sb.from("pipeline_templates").delete().eq("id", templateId.data).eq("client_id", clientId.data);
  if (e2) {
    console.warn("[config.pipeline.reset]", e2.code);
    return { error: dbErrorMessage(e2) };
  }
  revalidatePath(configPath(clientId.data));
  return { ok: true, message: "El cliente vuelve a usar el proceso estándar TPC." };
}

export async function addRequirementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error) return { error: auth.error, values: formValues(formData) };
  const clientId = optionalUuid.safeParse(String(formData.get("client_id") ?? ""));
  if (!clientId.success) return { error: "Datos inválidos." };

  const parsed = requirementSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  }
  if (isDemoMode()) return { error: DEMO_READ_ONLY, values: formValues(formData) };

  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("requirement_templates").insert({ ...parsed.data, client_id: clientId.data });
  if (error) {
    console.warn("[config.requirement.add]", error.code);
    return { error: dbErrorMessage(error), values: formValues(formData) };
  }
  revalidatePath(configPath(clientId.data));
  return { ok: true, message: "Requisito agregado." };
}

export async function toggleRequirementAction(formData: FormData): Promise<void> {
  const auth = await authorizeAction("configuracion:gestionar");
  const id = z.uuid().safeParse(formData.get("id"));
  const clientId = optionalUuid.safeParse(String(formData.get("client_id") ?? ""));
  const active = formData.get("is_active") === "true";
  if (auth.error || !id.success || !clientId.success || isDemoMode()) return;
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("requirement_templates").update({ is_active: active }).eq("id", id.data);
  if (error) console.warn("[config.requirement.toggle]", error.code);
  revalidatePath(configPath(clientId.data));
}

export async function createIntakeChannelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("fuentes:gestionar");
  if (auth.error) return { error: auth.error, values: formValues(formData) };
  const parsed = intakeChannelSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  }
  if (isDemoMode()) return { error: DEMO_READ_ONLY, values: formValues(formData) };

  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("intake_channels").insert({ ...parsed.data, code: channelCode(parsed.data.name), sort_order: 90 });
  if (error) {
    console.warn("[config.channel.create]", error.code);
    return { error: dbErrorMessage(error), values: formValues(formData) };
  }
  revalidatePath("/administracion/fuentes");
  return { ok: true, message: "Fuente agregada." };
}

export async function toggleIntakeChannelAction(formData: FormData): Promise<void> {
  const auth = await authorizeAction("fuentes:gestionar");
  const id = z.uuid().safeParse(formData.get("id"));
  const active = formData.get("is_active") === "true";
  if (auth.error || !id.success || isDemoMode()) return;
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("intake_channels").update({ is_active: active }).eq("id", id.data);
  if (error) console.warn("[config.channel.toggle]", error.code);
  revalidatePath("/administracion/fuentes");
}
