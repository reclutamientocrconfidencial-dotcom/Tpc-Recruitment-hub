import { z } from "zod";
import { CR_PROVINCES, CURRENCIES, EMPLOYMENT_TYPES, PRIORITY_LEVELS, WORK_MODALITIES } from "@/types/database";

const text = (max: number, label: string) =>
  z.string().trim().max(max, `${label}: máximo ${max} caracteres.`).optional().transform((v) => (v ? v : null));
const uuidOrEmpty = z.union([z.uuid(), z.literal("")], { error: "Selección inválida." }).optional().transform((v) => (v ? v : null));
const money = z
  .union([z.literal(""), z.coerce.number({ error: "Monto inválido." }).min(0, "El monto no puede ser negativo.").max(1e10, "Monto demasiado alto.")])
  .optional()
  .transform((v) => (v === "" || v == null ? null : v));

/** Datos editables de una vacante (el estado y las plazas cubiertas se cambian aparte). */
export const vacancySchema = z
  .object({
    title: z.string().trim().min(2, "Indique el título de la vacante.").max(200, "Título: máximo 200 caracteres."),
    position_id: uuidOrEmpty,
    position_id_new: text(150, "Nuevo puesto"),
    description: text(5000, "Descripción"),
    openings: z.coerce.number({ error: "Cantidad inválida." }).int("Cantidad entera.").min(1, "Al menos 1 plaza.").max(500, "Máximo 500 plazas."),
    province: z
      .union([z.enum(CR_PROVINCES), z.literal("")], { error: "Provincia inválida." })
      .optional()
      .transform((v) => (v ? v : null)),
    location_detail: text(300, "Ubicación"),
    modality: z.enum(WORK_MODALITIES, { error: "Seleccione la modalidad." }),
    employment_type: z.enum(EMPLOYMENT_TYPES, { error: "Seleccione el tipo de contratación." }),
    work_schedule: text(200, "Horario"),
    salary_min: money,
    salary_max: money,
    currency: z.enum(CURRENCIES, { error: "Moneda inválida." }),
    priority: z.enum(PRIORITY_LEVELS, { error: "Seleccione la prioridad." }),
    closes_at: z
      .union([z.literal(""), z.iso.date({ error: "Fecha inválida." })])
      .optional()
      .transform((v) => (v ? v : null)),
    recruiter_id: uuidOrEmpty,
  })
  .refine((r) => r.salary_min == null || r.salary_max == null || r.salary_min <= r.salary_max, {
    message: "El salario mínimo no puede ser mayor que el máximo.",
    path: ["salary_max"],
  });

export type VacancyInput = z.output<typeof vacancySchema>;

export function parseVacancyForm(formData: FormData) {
  return vacancySchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
}

export const filledSchema = z.object({
  id: z.uuid(),
  filled_count: z.coerce.number({ error: "Cantidad inválida." }).int("Cantidad entera.").min(0, "No puede ser negativa.").max(500, "Máximo 500."),
});
