import { z } from "zod";
import { ASSESSMENT_REQUIREMENTS, ASSESSMENT_STATUSES, INTERVIEW_KINDS, INTERVIEW_STATUSES, QUESTION_CATEGORIES, RECOMMENDATIONS } from "@/types/database";

const optUuid = z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || null);
const optText = (max: number, label: string) =>
  z.string().trim().max(max, `${label}: máximo ${max.toLocaleString("es-CR")} caracteres.`).optional().transform((v) => v || null);
const optDate = z.union([z.literal(""), z.iso.date({ error: "Fecha inválida." })]).optional().transform((v) => v || null);
const optNumber = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^\d{1,6}(\.\d{1,2})?$/.test(v), `${label}: número válido.`)
    .transform((v) => (v ? Number(v) : null));
const checkbox = z.string().optional().transform((v) => v === "on");

export const questionBankSchema = z.object({
  text: z.string().trim().min(5, "Pregunta: mínimo 5 caracteres.").max(500, "Pregunta: máximo 500 caracteres."),
  category: z.enum(QUESTION_CATEGORIES),
  guidance: optText(1000, "Qué observar"),
  position_id: optUuid,
  client_id: optUuid,
});

export const assessmentTypeSchema = z
  .object({
    name: z.string().trim().min(2, "Nombre: mínimo 2 caracteres.").max(100),
    description: optText(500, "Descripción"),
    scale_id: optUuid,
    max_score: optNumber("Puntaje máximo"),
    pass_score: optNumber("Puntaje mínimo"),
  })
  .refine((d) => d.pass_score == null || (d.max_score != null && d.pass_score <= d.max_score), {
    message: "El mínimo para aprobar requiere un máximo y no puede superarlo.",
    path: ["pass_score"],
  });

export const credentialTypeSchema = z.object({
  name: z.string().trim().min(2, "Nombre: mínimo 2 caracteres.").max(100),
  requires_expiry: checkbox,
  alert_days: z.coerce.number().int().min(0, "Alerta: 0 a 365 días.").max(365, "Alerta: 0 a 365 días."),
});

export const vacancyAssessmentSchema = z.object({
  vacancy_id: z.uuid(),
  assessment_type_id: z.uuid({ error: "Seleccione la evaluación." }),
  requirement: z.enum(ASSESSMENT_REQUIREMENTS),
  min_level_id: optUuid,
});

/** Fecha y hora local de Costa Rica (UTC−6, sin horario de verano) → ISO UTC. */
export function crLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00-06:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO → valor para <input type="datetime-local"> en hora de Costa Rica. */
export function isoToCrLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3600_000);
  return d.toISOString().slice(0, 16);
}

export const interviewScheduleSchema = z.object({
  application_id: z.uuid(),
  kind: z.enum(INTERVIEW_KINDS),
  scheduled_at: z
    .string()
    .transform((v) => crLocalToIso(v))
    .refine((v) => v !== null, "Indique fecha y hora."),
  duration_min: z.coerce.number().int().min(10, "Duración: 10 a 480 minutos.").max(480, "Duración: 10 a 480 minutos."),
  location: optText(300, "Lugar o enlace"),
  interviewer_id: optUuid,
});

export const interviewResultSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(INTERVIEW_STATUSES),
    rating: z.union([z.literal(""), z.coerce.number().int().min(1).max(5)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
    recommendation: z.union([z.literal(""), z.enum(RECOMMENDATIONS)]).optional().transform((v) => v || null),
    summary: optText(4000, "Resumen"),
  })
  .refine((d) => d.status !== "realizada" || d.recommendation, { message: "Indique la recomendación de la entrevista.", path: ["recommendation"] });

export const assessmentResultSchema = z.object({
  application_id: z.uuid(),
  assessment_type_id: z.uuid(),
  status: z.enum(ASSESSMENT_STATUSES),
  score: optNumber("Puntaje"),
  level_id: optUuid,
  evaluated_on: optDate,
  notes: optText(1000, "Observaciones"),
});

export const credentialSchema = z
  .object({
    candidate_id: z.uuid(),
    credential_type_id: z.uuid({ error: "Seleccione el tipo." }),
    identifier: optText(60, "Número"),
    issued_on: optDate,
    expires_on: optDate,
    notes: optText(500, "Notas"),
    verified: checkbox,
  })
  .refine((d) => !d.issued_on || !d.expires_on || d.expires_on >= d.issued_on, { message: "El vencimiento no puede ser anterior a la emisión.", path: ["expires_on"] });

/** Plantilla: una sección por línea, «Título | ayuda». La clave se deriva del título. */
export function parseTemplateSections(text: string): Array<{ key: string; title: string; help: string }> {
  const used = new Set<string>();
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => {
      const [title = "", ...rest] = line.split("|");
      const t = title.trim().slice(0, 100);
      let key = t
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || "seccion";
      while (used.has(key)) key = `${key}_2`;
      used.add(key);
      return { key, title: t, help: rest.join("|").trim().slice(0, 300) };
    })
    .filter((s) => s.title.length >= 2);
}

export const templateSchema = z.object({
  name: z.string().trim().min(3, "Nombre: mínimo 3 caracteres.").max(150),
  version: z.string().trim().min(1, "Indique la versión.").max(30),
  header_text: optText(500, "Encabezado"),
  footer_text: optText(500, "Pie de página"),
  sections: z
    .string()
    .transform((v) => parseTemplateSections(v))
    .refine((v) => v.length >= 1, "Indique al menos una sección (una por línea)."),
});
