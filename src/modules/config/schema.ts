import { z } from "zod";
import {
  INTAKE_CHANNEL_CATEGORIES,
  REQUIREMENT_CATEGORIES,
  REQUIREMENT_TYPES,
  STAGE_CATEGORIES,
  STAGE_TYPES,
} from "@/types/database";

/**
 * Etapa de un proceso. Normalmente proviene del catálogo (`catalog_stage_id`):
 * nombre, categoría y tipo los asigna la base de datos. Se mantiene el formato
 * anterior (nombre + categoría) por compatibilidad.
 */
export const stageSchema = z
  .object({
    catalog_stage_id: z
      .union([z.uuid(), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
    name: z.string().trim().max(60, "Nombre de etapa: máximo 60 caracteres.").optional(),
    category: z.enum(STAGE_CATEGORIES).optional(),
    stage_type: z.enum(STAGE_TYPES).optional(),
    target_days: z
      .union([z.literal(""), z.null(), z.coerce.number().int("Días: número entero.").min(0, "Días: mínimo 0.").max(365, "Días: máximo 365.")])
      .optional()
      .transform((v) => (v === "" || v == null ? null : v)),
  })
  .refine((s) => s.catalog_stage_id || (s.name && s.name.length >= 2 && s.category), "Seleccione una etapa del catálogo para cada fila.");

export const stagesSchema = z
  .array(stageSchema)
  .min(3, "El proceso debe tener al menos 3 etapas.")
  .max(50, "El proceso admite como máximo 50 etapas.")
  .refine(
    (s) => {
      const ids = s.map((x) => x.catalog_stage_id).filter(Boolean);
      return new Set(ids).size === ids.length;
    },
    "No repita etapas en el mismo proceso.",
  );

export function parseStagesJson(raw: unknown) {
  let value: unknown;
  try {
    value = JSON.parse(String(raw ?? "[]"));
  } catch {
    return { success: false as const, message: "Formato de etapas inválido." };
  }
  const parsed = stagesSchema.safeParse(value);
  if (!parsed.success) return { success: false as const, message: parsed.error.issues[0]?.message ?? "Etapas inválidas." };
  return { success: true as const, data: parsed.data };
}

const optional = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: máximo ${max} caracteres.`)
    .optional()
    .transform((v) => (v ? v : null));

const uuidOrEmpty = z
  .union([z.uuid(), z.literal("")], { error: "Selección inválida." })
  .optional()
  .transform((v) => (v ? v : null));

/** Requisito de una plantilla: del catálogo (o nuevo), con nivel y puesto opcionales. */
export const requirementSchema = z
  .object({
    catalog_requirement_id: uuidOrEmpty,
    catalog_requirement_id_new: optional(200, "Nuevo requisito"),
    new_category: z.enum(REQUIREMENT_CATEGORIES).optional(),
    position_id: uuidOrEmpty,
    position_id_new: optional(150, "Nuevo puesto"),
    min_level_id: uuidOrEmpty,
    requirement_type: z.enum(REQUIREMENT_TYPES, { error: "Tipo inválido." }),
    weight: z.coerce.number().int().min(1, "Peso entre 1 y 5.").max(5, "Peso entre 1 y 5."),
  })
  .refine((r) => r.catalog_requirement_id || (r.catalog_requirement_id_new && r.catalog_requirement_id_new.length >= 2), {
    message: "Seleccione un requisito del catálogo o escriba uno nuevo.",
    path: ["catalog_requirement_id"],
  });

export const intakeChannelSchema = z.object({
  name: z.string().trim().min(2, "Ingrese el nombre de la fuente.").max(80, "Nombre: máximo 80 caracteres."),
  category: z.enum(INTAKE_CHANNEL_CATEGORIES, { error: "Seleccione una categoría." }),
  detail_label: optional(80, "Detalle solicitado"),
});

/** Código interno a partir del nombre: minúsculas, sin acentos, con guion bajo. */
export function channelCode(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "fuente"
  );
}
