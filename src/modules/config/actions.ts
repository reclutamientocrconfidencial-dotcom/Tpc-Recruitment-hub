"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, fieldErrorsFrom, formValues, type ActionState } from "@/lib/action-state";
import { channelCode, intakeChannelSchema, parseStagesJson, requirementSchema } from "@/modules/config/schema";
import { resolveCatalogId } from "@/modules/catalogs/resolve";
import type { PipelineStage } from "@/types/database";

/** Resultado del guardado de etapas: incluye lo que realmente quedó en la base de datos. */
export interface PipelineSaveState extends ActionState {
  templateId?: string;
  savedStages?: PipelineStage[];
  savedAt?: number;
}

const optionalUuid = z.union([z.uuid(), z.literal("")]).transform((v) => (v === "" ? null : v));

function configPath(clientId: string | null, vacancyId: string | null = null) {
  if (vacancyId) return `/vacantes/${vacancyId}`;
  return clientId ? `/clientes/${clientId}/configuracion` : "/administracion/procesos";
}

/** Vacante de alcance (opcional): las configuraciones propias de una vacante viven en su ficha. */
function vacancyScope(formData: FormData): { ok: boolean; id: string | null } {
  const r = optionalUuid.safeParse(String(formData.get("vacancy_id") ?? ""));
  return r.success ? { ok: true, id: r.data } : { ok: false, id: null };
}

/** Guarda las etapas de un proceso. Si el cliente no tiene proceso propio, lo crea. */
export async function savePipelineAction(_prev: PipelineSaveState, formData: FormData): Promise<PipelineSaveState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error) return { error: auth.error };

  const clientId = optionalUuid.safeParse(String(formData.get("client_id") ?? ""));
  const templateId = optionalUuid.safeParse(String(formData.get("template_id") ?? ""));
  const vacancy = vacancyScope(formData);
  if (!clientId.success || !templateId.success || !vacancy.ok) return { error: "Datos inválidos." };
  const path = configPath(clientId.data, vacancy.id);

  const stages = parseStagesJson(formData.get("stages"));
  if (!stages.success) return { error: stages.message };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };

  const sb = await createSupabaseServerClient();
  let id = templateId.data;
  const isNew = !id;
  if (!id) {
    if (!clientId.data && !vacancy.id) return { error: "Proceso inválido." };
    // Se crea sin marcar como predeterminado hasta que las etapas se guarden bien.
    const { data, error } = await sb
      .from("pipeline_templates")
      .insert(
        vacancy.id
          ? { vacancy_id: vacancy.id, name: "Proceso de la vacante", is_default: false }
          : { client_id: clientId.data, name: "Proceso del cliente", is_default: false },
      )
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
  // Verificación: se vuelve a leer lo almacenado y se compara con lo enviado.
  // La pantalla mostrará exactamente lo que quedó en la base de datos.
  const { data: saved, error: readError } = await sb
    .from("pipeline_stages")
    .select("id, catalog_stage_id, position, name, category, stage_type, target_days")
    .eq("template_id", id)
    .order("position");
  if (readError || !saved) {
    console.warn("[config.pipeline.verify]", readError?.code);
    return { error: "No fue posible verificar el proceso guardado. Recargue la página antes de continuar." };
  }
  const sent = stages.data.map((s) => s.catalog_stage_id ?? s.name ?? "");
  const stored = (saved as PipelineStage[]).map((s, i) => (stages.data[i]?.catalog_stage_id ? s.catalog_stage_id : s.name) ?? "");
  if (sent.length !== stored.length || sent.some((v, i) => v !== stored[i])) {
    console.error("[config.pipeline.verify] mismatch", { template: id, sent: sent.length, stored: stored.length });
    revalidatePath(path);
    return {
      error: "La base de datos no confirmó el cambio: se muestra el proceso realmente almacenado. Informe a soporte.",
      templateId: id,
      savedStages: saved as PipelineStage[],
      savedAt: Date.now(),
    };
  }

  revalidatePath(path);
  return {
    ok: true,
    message: "Proceso guardado y verificado en la base de datos.",
    templateId: id,
    savedStages: saved as PipelineStage[],
    savedAt: Date.now(),
  };
}

/**
 * Elimina un proceso propio (de cliente o de puesto) para volver al proceso
 * heredado. El proceso estándar global nunca se elimina.
 */
export async function resetClientPipelineAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error) return { error: auth.error };
  const clientId = optionalUuid.safeParse(String(formData.get("client_id") ?? ""));
  const templateId = z.uuid().safeParse(formData.get("template_id"));
  const vacancy = vacancyScope(formData);
  if (!clientId.success || !templateId.success || !vacancy.ok) return { error: "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };

  const sb = await createSupabaseServerClient();
  const { data: t } = await sb.from("pipeline_templates").select("id, client_id, position_id, vacancy_id").eq("id", templateId.data).maybeSingle();
  if (!t || (!t.client_id && !t.position_id && !t.vacancy_id)) return { error: "El proceso estándar TPC no se puede eliminar." };

  // Se desmarca como predeterminado y se elimina (la política impide borrar predeterminados).
  const { error: e1 } = await sb.from("pipeline_templates").update({ is_default: false }).eq("id", templateId.data);
  const { error: e2 } = e1 ? { error: e1 } : await sb.from("pipeline_templates").delete().eq("id", templateId.data);
  if (e2) {
    console.warn("[config.pipeline.reset]", e2.code);
    return { error: dbErrorMessage(e2) };
  }
  revalidatePath(configPath(clientId.data, vacancy.id));
  if (t.vacancy_id) return { ok: true, message: "La vacante vuelve a usar el proceso heredado." };
  return { ok: true, message: t.position_id ? "Proceso del puesto eliminado; se usará el proceso heredado." : "El cliente vuelve a usar el proceso estándar TPC." };
}

/** Crea un proceso para un puesto (de un cliente o global) duplicando uno existente. */
export async function duplicatePipelineAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error) return { error: auth.error };
  const parsed = z
    .object({
      client_id: optionalUuid,
      source_template_id: z.uuid({ error: "Seleccione el proceso base." }),
      position_id: optionalUuid,
      position_id_new: z.string().trim().max(150).transform((v) => (v === "" ? null : v)),
    })
    .safeParse({
      client_id: String(formData.get("client_id") ?? ""),
      source_template_id: formData.get("source_template_id"),
      position_id: String(formData.get("position_id") ?? ""),
      position_id_new: String(formData.get("position_id_new") ?? ""),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (!parsed.data.position_id && !parsed.data.position_id_new) return { error: "Seleccione o escriba el puesto." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };

  const sb = await createSupabaseServerClient();
  const position = await resolveCatalogId(sb, "job_positions", parsed.data.position_id, parsed.data.position_id_new);
  if (position.error || !position.id) return { error: position.error ?? "Puesto inválido." };

  const { error } = await sb.rpc("duplicate_pipeline_template", {
    p_source_id: parsed.data.source_template_id,
    p_client_id: parsed.data.client_id,
    p_position_id: position.id,
    p_vacancy_id: null,
    p_name: null,
  });
  if (error) {
    console.warn("[config.pipeline.duplicate]", error.code);
    return { error: error.code === "23505" ? "Ese puesto ya tiene un proceso propio." : dbErrorMessage(error) };
  }
  revalidatePath(configPath(parsed.data.client_id));
  return { ok: true, message: "Proceso del puesto creado. Ajuste sus etapas si lo necesita." };
}

/** Copia el proceso y/o los requisitos de otro cliente (sin duplicar lo existente). */
export async function copyClientConfigAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error) return { error: auth.error };
  const target = z.uuid().safeParse(formData.get("client_id"));
  const source = z.uuid({ error: "Seleccione el cliente de origen." }).safeParse(formData.get("source_client_id"));
  const copyProcess = formData.get("copy_process") === "on";
  const copyReqs = formData.get("copy_requirements") === "on";
  if (!target.success) return { error: "Cliente inválido." };
  if (!source.success) return { error: source.error.issues[0]?.message ?? "Seleccione el cliente de origen." };
  if (!copyProcess && !copyReqs) return { error: "Seleccione qué desea copiar." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };

  const sb = await createSupabaseServerClient();
  const notes: string[] = [];

  if (copyProcess) {
    const { data: templates } = await sb
      .from("pipeline_templates")
      .select("id, position_id")
      .eq("client_id", source.data)
      .eq("is_default", true)
      .is("vacancy_id", null);
    if (!templates || templates.length === 0) notes.push("El cliente de origen no tiene procesos propios.");
    let copied = 0;
    let skipped = 0;
    for (const t of templates ?? []) {
      const { error } = await sb.rpc("duplicate_pipeline_template", {
        p_source_id: t.id,
        p_client_id: target.data,
        p_position_id: t.position_id,
        p_vacancy_id: null,
        p_name: null,
      });
      if (!error) copied++;
      else if (error.code === "23505") skipped++;
      else {
        console.warn("[config.copy.process]", error.code);
        return { error: dbErrorMessage(error) };
      }
    }
    if (copied) notes.push(`${copied} proceso(s) copiado(s).`);
    if (skipped) notes.push(`${skipped} proceso(s) omitido(s) porque ya existían.`);
  }

  if (copyReqs) {
    const { data: scopes } = await sb.from("requirement_templates").select("position_id").eq("client_id", source.data).is("vacancy_id", null);
    const positions = [...new Set((scopes ?? []).map((r) => (r.position_id as string | null) ?? ""))];
    let total = 0;
    for (const pos of positions) {
      const { data, error } = await sb.rpc("copy_requirement_templates", {
        p_from_client_id: source.data,
        p_from_position_id: pos || null,
        p_to_client_id: target.data,
        p_to_position_id: pos || null,
      });
      if (error) {
        console.warn("[config.copy.requirements]", error.code);
        return { error: dbErrorMessage(error) };
      }
      total += Number(data ?? 0);
    }
    notes.push(`${total} requisito(s) copiado(s).`);
  }

  revalidatePath(configPath(target.data));
  return { ok: true, message: notes.join(" ") };
}

export async function addRequirementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error) return { error: auth.error, values: formValues(formData) };
  const clientId = optionalUuid.safeParse(String(formData.get("client_id") ?? ""));
  const vacancy = vacancyScope(formData);
  if (!clientId.success || !vacancy.ok) return { error: "Datos inválidos." };

  const parsed = requirementSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  }
  if (isDemoMode()) return { error: DEMO_READ_ONLY, values: formValues(formData) };
  const d = parsed.data;

  const sb = await createSupabaseServerClient();
  const requirement = await resolveCatalogId(sb, "requirement_catalog", d.catalog_requirement_id, d.catalog_requirement_id_new, {
    category: d.new_category ?? "otro",
  });
  if (requirement.error || !requirement.id) return { error: requirement.error ?? "Requisito inválido.", values: formValues(formData) };
  const position = await resolveCatalogId(sb, "job_positions", d.position_id, d.position_id_new);
  if (position.error) return { error: position.error, values: formValues(formData) };

  const { error } = await sb.from("requirement_templates").insert({
    client_id: clientId.data,
    vacancy_id: vacancy.id,
    catalog_requirement_id: requirement.id,
    position_id: position.id,
    // Un requisito nuevo no tiene escala: el nivel solo aplica a requisitos del catálogo con escala.
    min_level_id: d.catalog_requirement_id ? d.min_level_id : null,
    requirement: d.catalog_requirement_id_new ?? "—", // la base de datos lo reemplaza por el nombre del catálogo
    requirement_type: d.requirement_type,
    weight: d.weight,
  });
  if (error) {
    console.warn("[config.requirement.add]", error.code);
    return { error: dbErrorMessage(error), values: formValues(formData) };
  }
  revalidatePath(configPath(clientId.data, vacancy.id));
  return { ok: true, message: "Requisito agregado." };
}

export async function toggleRequirementAction(formData: FormData): Promise<void> {
  const auth = await authorizeAction("configuracion:gestionar");
  const id = z.uuid().safeParse(formData.get("id"));
  const clientId = optionalUuid.safeParse(String(formData.get("client_id") ?? ""));
  const active = formData.get("is_active") === "true";
  const vacancy = vacancyScope(formData);
  if (auth.error || !id.success || !clientId.success || !vacancy.ok || isDemoMode()) return;
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("requirement_templates").update({ is_active: active }).eq("id", id.data);
  if (error) console.warn("[config.requirement.toggle]", error.code);
  revalidatePath(configPath(clientId.data, vacancy.id));
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
