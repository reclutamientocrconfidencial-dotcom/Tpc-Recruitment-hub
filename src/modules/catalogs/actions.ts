"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, fieldErrorsFrom, formValues, type ActionState } from "@/lib/action-state";
import {
  CATALOG_TABLES,
  levelSchema,
  positionSchema,
  requirementCatalogSchema,
  scaleSchema,
  stageCatalogSchema,
} from "@/modules/catalogs/schema";

const CATALOG_PATHS: Record<(typeof CATALOG_TABLES)[number], string> = {
  stage_catalog: "/administracion/catalogos/etapas",
  job_positions: "/administracion/catalogos/puestos",
  requirement_catalog: "/administracion/catalogos/requisitos",
  proficiency_scales: "/administracion/catalogos/niveles",
  proficiency_levels: "/administracion/catalogos/niveles",
};

function refreshConfig(path: string) {
  revalidatePath(path);
  // Los editores de configuración usan estos catálogos.
  revalidatePath("/administracion/procesos");
  revalidatePath("/clientes/[id]/configuracion", "page");
}

async function insertCatalog(
  table: "stage_catalog" | "job_positions" | "requirement_catalog",
  row: Record<string, unknown>,
  formData: FormData,
  okMessage: string,
): Promise<ActionState> {
  if (isDemoMode()) return { error: DEMO_READ_ONLY, values: formValues(formData) };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from(table).insert(row);
  if (error) {
    console.warn(`[catalogs.${table}.create]`, error.code);
    const msg = error.code === "23505" ? "Ya existe un elemento con ese nombre en el catálogo (puede estar inactivo)." : dbErrorMessage(error);
    return { error: msg, values: formValues(formData) };
  }
  refreshConfig(CATALOG_PATHS[table]);
  return { ok: true, message: okMessage };
}

export async function createStageCatalogAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error !== null) return { error: auth.error, values: formValues(formData) };
  const parsed = stageCatalogSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  return insertCatalog("stage_catalog", { ...parsed.data, sort_order: 95 }, formData, `Etapa «${parsed.data.name}» agregada al catálogo.`);
}

export async function createPositionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error !== null) return { error: auth.error, values: formValues(formData) };
  const parsed = positionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  return insertCatalog("job_positions", parsed.data, formData, `Puesto «${parsed.data.name}» agregado.`);
}

export async function createRequirementCatalogAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error !== null) return { error: auth.error, values: formValues(formData) };
  const parsed = requirementCatalogSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  return insertCatalog("requirement_catalog", parsed.data, formData, `Requisito «${parsed.data.name}» agregado.`);
}

export async function createScaleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error !== null) return { error: auth.error, values: formValues(formData) };
  const parsed = scaleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error), values: formValues(formData) };
  if (isDemoMode()) return { error: DEMO_READ_ONLY, values: formValues(formData) };

  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from("proficiency_scales")
    .insert({ name: parsed.data.name, description: parsed.data.description })
    .select("id")
    .single();
  if (error) {
    console.warn("[catalogs.scale.create]", error.code);
    return { error: error.code === "23505" ? "Ya existe una escala con ese nombre." : dbErrorMessage(error), values: formValues(formData) };
  }
  const { error: e2 } = await sb
    .from("proficiency_levels")
    .insert(parsed.data.levels.map((label, i) => ({ scale_id: data.id, position: i + 1, label })));
  if (e2) {
    console.warn("[catalogs.levels.create]", e2.code);
    // La escala queda inactiva para no ofrecerla incompleta (sin borrar: trazabilidad).
    await sb.from("proficiency_scales").update({ is_active: false }).eq("id", data.id);
    return { error: dbErrorMessage(e2), values: formValues(formData) };
  }
  refreshConfig(CATALOG_PATHS.proficiency_scales);
  return { ok: true, message: `Escala «${parsed.data.name}» creada con ${parsed.data.levels.length} niveles.` };
}

export async function addLevelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("configuracion:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const parsed = levelSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };

  const sb = await createSupabaseServerClient();
  const { data: last } = await sb
    .from("proficiency_levels")
    .select("position")
    .eq("scale_id", parsed.data.scale_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await sb
    .from("proficiency_levels")
    .insert({ scale_id: parsed.data.scale_id, label: parsed.data.label, position: ((last?.position as number | undefined) ?? 0) + 1 });
  if (error) {
    console.warn("[catalogs.level.add]", error.code);
    return { error: error.code === "23505" ? "Ese nivel ya existe en la escala." : dbErrorMessage(error) };
  }
  refreshConfig(CATALOG_PATHS.proficiency_levels);
  return { ok: true, message: "Nivel agregado al final de la escala." };
}

/** Activar / desactivar cualquier elemento de catálogo (nunca se borra). */
export async function toggleCatalogItemAction(formData: FormData): Promise<void> {
  const auth = await authorizeAction("configuracion:gestionar");
  const table = z.enum(CATALOG_TABLES).safeParse(formData.get("table"));
  const id = z.uuid().safeParse(formData.get("id"));
  const active = formData.get("is_active") === "true";
  if (auth.error || !table.success || !id.success || isDemoMode()) return;
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from(table.data).update({ is_active: active }).eq("id", id.data);
  if (error) console.warn("[catalogs.toggle]", table.data, error.code);
  refreshConfig(CATALOG_PATHS[table.data]);
}
