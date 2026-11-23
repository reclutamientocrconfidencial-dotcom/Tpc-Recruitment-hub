import { z } from "zod";
import {
  INTAKE_CHANNEL_CATEGORIES,
  REQUIREMENT_CATEGORIES,
  REQUIREMENT_TYPES,
  STAGE_CATEGORIES,
  STAGE_TYPES,
} from "@/types/database";

export const stageSchema = z.object({
  name: z.string().trim().min(2, "Cada etapa necesita un nombre (mín. 2 caracteres).").max(60, "Nombre de etapa: máximo 60 caracteres."),
  category: z.enum(STAGE_CATEGORIES, { error: "Categoría de etapa inválida." }),
  stage_type: z.enum(STAGE_TYPES, { error: "Tipo de etapa inválido." }),
  target_days: z
    .union([z.literal(""), z.coerce.number().int("Días: número entero.").min(0, "Días: mínimo 0.").max(365, "Días: máximo 365.")])
    .transform((v) => (v === "" ? null : v)),
});

/** Reglas del proceso (también validadas en la base de datos). */
export const stagesSchema = z
  .array(stageSchema)
  .min(3, "El proceso debe tener al menos 3 etapas.")
  .max(50, "El proceso admite como máximo 50 etapas.")
  .refine((s) => s.some((x) => x.category === "nuevo"), "Incluya al menos una etapa de categoría «Nuevo».")
  .refine((s) => s.some((x) => x.category === "contratado"), "Incluya al menos una etapa de categoría «Contratado».")
  .refine((s) => s.some((x) => x.category === "descartado"), "Incluya al menos una etapa de categoría «Descartado».")
  .refine((s) => new Set(s.map((x) => x.name.toLowerCase())).size === s.length, "No repita nombres de etapa.");

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
  z.string().trim().max(max, `${label}: máximo ${max} caracteres.`).transform((v) => (v === "" ? null : v));

export const requirementSchema = z.object({
  position_title: optional(120, "Posición"),
  requirement: z.string().trim().min(2, "Describa el requisito.").max(300, "Requisito: máximo 300 caracteres."),
  requirement_type: z.enum(REQUIREMENT_TYPES, { error: "Tipo inválido." }),
  category: z.enum(REQUIREMENT_CATEGORIES, { error: "Categoría inválida." }),
  expected_level: optional(120, "Nivel esperado"),
  weight: z.coerce.number().int().min(1, "Peso entre 1 y 5.").max(5, "Peso entre 1 y 5."),
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
