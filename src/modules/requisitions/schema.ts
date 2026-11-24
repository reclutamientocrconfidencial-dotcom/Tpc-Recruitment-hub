import { z } from "zod";
import { CR_PROVINCES, CURRENCIES, PRIORITY_LEVELS, WORK_MODALITIES } from "@/types/database";

const text = (max: number, label: string) =>
  z.string().trim().max(max, `${label}: máximo ${max} caracteres.`).optional().transform((v) => (v ? v : null));
const uuidOrEmpty = z.union([z.uuid(), z.literal("")], { error: "Selección inválida." }).optional().transform((v) => (v ? v : null));
const money = z
  .union([z.literal(""), z.coerce.number({ error: "Monto inválido." }).min(0, "El monto no puede ser negativo.").max(1e10, "Monto demasiado alto.")])
  .optional()
  .transform((v) => (v === "" || v == null ? null : v));
const isoDate = z
  .union([z.literal(""), z.iso.date({ error: "Fecha inválida." })])
  .optional()
  .transform((v) => (v ? v : null));

/** Validación de requisiciones (navegador y servidor). El estado no se edita aquí. */
export const requisitionSchema = z
  .object({
    client_id: z.uuid({ error: "Seleccione el cliente." }),
    position_id: uuidOrEmpty,
    position_id_new: text(150, "Nuevo puesto"),
    title: z.string().trim().min(2, "Indique el título del puesto solicitado.").max(200, "Título: máximo 200 caracteres."),
    department: text(120, "Departamento"),
    positions_count: z.coerce.number({ error: "Cantidad inválida." }).int("Cantidad entera.").min(1, "Al menos 1 plaza.").max(500, "Máximo 500 plazas."),
    priority: z.enum(PRIORITY_LEVELS, { error: "Seleccione la prioridad." }),
    target_date: isoDate,
    salary_min: money,
    salary_max: money,
    currency: z.enum(CURRENCIES, { error: "Moneda inválida." }),
    province: z
      .union([z.enum(CR_PROVINCES), z.literal("")], { error: "Provincia inválida." })
      .optional()
      .transform((v) => (v ? v : null)),
    modality: z
      .union([z.enum(WORK_MODALITIES), z.literal("")], { error: "Modalidad inválida." })
      .optional()
      .transform((v) => (v ? v : null)),
    work_schedule: text(200, "Horario"),
    requested_by_name: text(150, "Solicitado por"),
    justification: text(2000, "Justificación"),
    assigned_recruiter_id: uuidOrEmpty,
  })
  .refine((r) => r.salary_min == null || r.salary_max == null || r.salary_min <= r.salary_max, {
    message: "El salario mínimo no puede ser mayor que el máximo.",
    path: ["salary_max"],
  });

export type RequisitionInput = z.output<typeof requisitionSchema>;

export function parseRequisitionForm(formData: FormData) {
  return requisitionSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
}
