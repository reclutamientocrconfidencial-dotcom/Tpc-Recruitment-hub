import { z } from "zod";
import { REQUIREMENT_CATEGORIES, STAGE_CATEGORIES, STAGE_TYPES } from "@/types/database";

/** Texto opcional: acepta campo ausente, vacío o con contenido. */
const optional = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: máximo ${max} caracteres.`)
    .optional()
    .transform((v) => (v ? v : null));

export const stageCatalogSchema = z.object({
  name: z.string().trim().min(2, "Nombre de etapa: mínimo 2 caracteres.").max(60, "Nombre de etapa: máximo 60 caracteres."),
  category: z.enum(STAGE_CATEGORIES, { error: "Seleccione la categoría." }),
  stage_type: z.enum(STAGE_TYPES, { error: "Seleccione el tipo." }),
  default_target_days: z
    .union([z.literal(""), z.coerce.number().int().min(0, "Días: mínimo 0.").max(365, "Días: máximo 365.")])
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
  description: optional(300, "Descripción"),
});

export const positionSchema = z.object({
  name: z.string().trim().min(2, "Nombre del puesto: mínimo 2 caracteres.").max(150, "Nombre del puesto: máximo 150 caracteres."),
  area: optional(100, "Área"),
  description: optional(500, "Descripción"),
});

export const requirementCatalogSchema = z.object({
  name: z.string().trim().min(2, "Nombre del requisito: mínimo 2 caracteres.").max(200, "Nombre: máximo 200 caracteres."),
  category: z.enum(REQUIREMENT_CATEGORIES, { error: "Seleccione la categoría." }),
  scale_id: z
    .union([z.uuid(), z.literal("")], { error: "Escala inválida." })
    .optional()
    .transform((v) => (v ? v : null)),
  description: optional(500, "Descripción"),
});

/** Niveles: uno por línea, del más bajo al más alto. */
export const scaleSchema = z.object({
  name: z.string().trim().min(2, "Nombre de la escala: mínimo 2 caracteres.").max(80, "Nombre: máximo 80 caracteres."),
  description: optional(300, "Descripción"),
  levels: z
    .string()
    .transform((v) =>
      v
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string().max(60, "Cada nivel: máximo 60 caracteres."))
        .min(1, "Indique al menos un nivel.")
        .max(20, "Máximo 20 niveles.")
        .refine((l) => new Set(l.map((x) => x.toLowerCase())).size === l.length, "No repita niveles."),
    ),
});

export const levelSchema = z.object({
  scale_id: z.uuid({ error: "Escala inválida." }),
  label: z.string().trim().min(1, "Indique el nivel.").max(60, "Nivel: máximo 60 caracteres."),
});

/** Tablas de catálogo que admiten activar/desactivar. */
export const CATALOG_TABLES = ["stage_catalog", "job_positions", "requirement_catalog", "proficiency_scales", "proficiency_levels"] as const;
export type CatalogTable = (typeof CATALOG_TABLES)[number];
