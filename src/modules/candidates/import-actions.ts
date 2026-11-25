"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, fieldErrorsFrom, type ActionState } from "@/lib/action-state";
import { IMPORT_CHUNK, IMPORT_COLUMNS, importBatchSchema, normalizeImportRow, type ImportKey } from "@/modules/candidates/schema";

const MANAGERS = ["admin", "coordinador"];

async function authorizeImport() {
  const auth = await authorizeAction("candidatos:crear");
  if (auth.error !== null) return { error: auth.error };
  if (!auth.user?.role || !MANAGERS.includes(auth.user.role)) return { error: "Solo administración y coordinación importan candidatos." };
  return { error: null };
}

/** Paso 1: crea el lote con la declaración de consentimiento y el motivo. */
export async function createImportBatchAction(input: Record<string, string>): Promise<{ id?: string; error?: string; fieldErrors?: Record<string, string> }> {
  const auth = await authorizeImport();
  if (auth.error) return { error: auth.error };
  const parsed = importBatchSchema.safeParse(input);
  if (!parsed.success) return { error: "Revise los campos marcados.", fieldErrors: fieldErrorsFrom(parsed.error) };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("import_batch_create", {
    p_file_name: parsed.data.file_name,
    p_consent_text_id: parsed.data.consent_text_id,
    p_channel: parsed.data.consent_channel,
    p_evidence: parsed.data.consent_evidence,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: dbErrorMessage(error) };
  return { id: data as string };
}

const rowsSchema = z
  .array(
    z.object({
      row_number: z.number().int().min(1).max(100_000),
      values: z.record(z.string(), z.string().max(500)),
    }),
  )
  .max(IMPORT_CHUNK);

/** Paso 2: valida y agrega un bloque de filas (máx. 500); la BD detecta duplicados. */
export async function addImportRowsAction(batchId: string, rows: unknown): Promise<{ added?: number; error?: string }> {
  const auth = await authorizeImport();
  if (auth.error) return { error: auth.error };
  const id = z.uuid().safeParse(batchId);
  const parsed = rowsSchema.safeParse(rows);
  if (!id.success || !parsed.success) return { error: "Bloque de filas inválido." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const [cantons, channels] = await Promise.all([
    sb.from("cr_cantons").select("province, name"),
    sb.from("intake_channels").select("id, name").eq("is_active", true),
  ]);
  const keys = new Set<string>(IMPORT_COLUMNS.map((c) => c.key));
  const normalized = parsed.data.map((r) =>
    normalizeImportRow(
      { row_number: r.row_number, values: Object.fromEntries(Object.entries(r.values).filter(([k]) => keys.has(k))) as Partial<Record<ImportKey, string>> },
      { cantons: (cantons.data ?? []) as Array<{ province: string; name: string }>, channels: (channels.data ?? []) as Array<{ id: string; name: string }> },
    ),
  );
  const { data, error } = await sb.rpc("import_batch_add_rows", { p_batch: id.data, p_rows: normalized });
  if (error) {
    console.warn("[import.addRows]", error.code);
    return { error: dbErrorMessage(error) };
  }
  return { added: data as number };
}

/** Paso 3: cierra la carga; el lote queda listo para revisión. */
export async function finishImportAction(batchId: string): Promise<{ error?: string }> {
  const auth = await authorizeImport();
  if (auth.error) return { error: auth.error };
  const id = z.uuid().safeParse(batchId);
  if (!id.success) return { error: "Lote inválido." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("import_batch_finish", { p_batch: id.data });
  if (error) return { error: dbErrorMessage(error) };
  // Consultar el informe del lote implica ver datos personales del archivo.
  await sb.rpc("log_access", { p_action: "ver_dato_sensible", p_resource: "importacion", p_record_id: id.data, p_reason: "Revisión del informe de importación", p_item_count: null });
  revalidatePath("/candidatos/importar");
  return {};
}

export async function setImportDecisionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeImport();
  if (auth.error) return { error: auth.error };
  const batch = z.uuid().safeParse(formData.get("batch_id"));
  const row = z.coerce.number().int().min(1).safeParse(formData.get("row_number"));
  const decision = z.enum(["crear", "actualizar", "omitir"]).safeParse(formData.get("decision"));
  if (!batch.success || !row.success || !decision.success) return { error: "Seleccione una decisión." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("import_set_decision", { p_batch: batch.data, p_row: row.data, p_decision: decision.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/candidatos/importar/${batch.data}`);
  return { ok: true, message: "Decisión guardada." };
}

export async function commitImportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeImport();
  if (auth.error) return { error: auth.error };
  const batch = z.uuid().safeParse(formData.get("batch_id"));
  if (!batch.success) return { error: "Lote inválido." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("import_batch_commit", { p_batch: batch.data });
  if (error) return { error: dbErrorMessage(error) };
  const r = data as { creados: number; actualizados: number; omitidos: number };
  revalidatePath(`/candidatos/importar/${batch.data}`);
  revalidatePath("/candidatos");
  return { ok: true, message: `Importación completada: ${r.creados} creados, ${r.actualizados} actualizados, ${r.omitidos} omitidos.` };
}

export async function cancelImportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeImport();
  if (auth.error) return { error: auth.error };
  const batch = z.uuid().safeParse(formData.get("batch_id"));
  if (!batch.success) return { error: "Lote inválido." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("import_batch_cancel", { p_batch: batch.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/candidatos/importar/${batch.data}`);
  return { ok: true, message: "Lote cancelado. Los datos del archivo se eliminaron." };
}

export async function revertImportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("usuarios:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const batch = z.uuid().safeParse(formData.get("batch_id"));
  const reason = z.string().trim().min(5, "Indique el motivo (mínimo 5 caracteres).").max(300).safeParse(formData.get("reason"));
  if (!batch.success) return { error: "Lote inválido." };
  if (!reason.success) return { error: reason.error.issues[0]?.message ?? "Motivo inválido." };
  if (isDemoMode()) return { error: DEMO_READ_ONLY };
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("import_batch_revert", { p_batch: batch.data, p_reason: reason.data });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/candidatos/importar/${batch.data}`);
  revalidatePath("/candidatos");
  return { ok: true, message: `Lote revertido: ${data as number} candidato(s) eliminados (los que tenían postulaciones se conservaron).` };
}
