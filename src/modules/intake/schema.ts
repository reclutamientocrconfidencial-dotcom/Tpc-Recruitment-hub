import { z } from "zod";
import { CR_PROVINCES, QUESTION_KINDS, type FormQuestion } from "@/types/database";
import { normalizePhone } from "@/lib/normalize";

const PHONE_RE = /^\+?[0-9\s()-]{8,20}$/;
/** Tiempo mínimo para completar el formulario (los robots lo envían al instante). */
export const MIN_FILL_MS = 3_000;
/** Vigencia máxima de la página del formulario antes de exigir recargarla. */
export const MAX_FILL_MS = 6 * 60 * 60 * 1000;

const optionalText = (max: number, msg: string) =>
  z.string().trim().max(max, msg).optional().transform((v) => v || undefined);

/** Datos del formulario público. La base de datos vuelve a validar todo. */
export const publicSubmissionSchema = z
  .object({
    first_name: z.string().trim().min(1, "Indique su nombre.").max(100, "Nombre: máximo 100 caracteres."),
    last_name: z.string().trim().min(1, "Indique sus apellidos.").max(150, "Apellidos: máximo 150 caracteres."),
    email: z.union([z.literal(""), z.email({ error: "Correo inválido." }).max(200)]).optional().transform((v) => (v ? v.toLowerCase() : undefined)),
    phone: z
      .string()
      .trim()
      .max(30)
      .optional()
      .refine((v) => !v || PHONE_RE.test(v), "Teléfono inválido (ej.: 8888-8888).")
      .transform((v) => (v ? normalizePhone(v) : undefined)),
    national_id: z
      .string()
      .trim()
      .max(30)
      .optional()
      .refine((v) => !v || /^[0-9A-Za-z\s-]{4,30}$/.test(v), "Identificación inválida.")
      .transform((v) => v || undefined),
    province: z.union([z.literal(""), z.enum(CR_PROVINCES)]).optional().transform((v) => v || undefined),
    canton: optionalText(80, "Cantón inválido."),
    district: optionalText(100, "Distrito: máximo 100 caracteres."),
    locality: optionalText(150, "Localidad: máximo 150 caracteres."),
    current_title: optionalText(150, "Ocupación: máximo 150 caracteres."),
    years_experience: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^\d{1,2}(\.\d)?$/.test(v), "Años de experiencia: número entre 0 y 70.")
      .transform((v) => v || undefined),
    position_id: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || undefined),
    consent: z.literal("on", { error: "Debe aceptar el consentimiento informado para enviar su postulación." }),
    consent_text_id: z.uuid({ error: "Recargue la página e intente de nuevo." }),
  })
  .refine((d) => d.email || d.phone, { message: "Indique al menos un correo o un teléfono de contacto.", path: ["email"] });

export type PublicSubmission = z.infer<typeof publicSubmissionSchema>;

/** Respuestas a preguntas de preselección: campos "q_<id>". */
export function extractAnswers(formData: FormData, questions: Array<Pick<FormQuestion, "id" | "label" | "kind" | "options" | "required">>) {
  const answers: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const q of questions) {
    const raw = String(formData.get(`q_${q.id}`) ?? "").trim().slice(0, 1000);
    if (!raw) {
      if (q.required) errors[`q_${q.id}`] = "Responda esta pregunta.";
      continue;
    }
    if (q.kind === "si_no" && raw !== "si" && raw !== "no") errors[`q_${q.id}`] = "Respuesta no válida.";
    else if (q.kind === "opcion" && !q.options.includes(raw)) errors[`q_${q.id}`] = "Seleccione una opción.";
    else if (q.kind === "numero" && !/^\d{1,6}(\.\d{1,2})?$/.test(raw)) errors[`q_${q.id}`] = "Indique un número.";
    else answers[q.id] = raw;
  }
  return { answers, errors };
}

/**
 * ¿Cumple el criterio de preselección? Igual que la base de datos:
 * null si la pregunta no es eliminatoria.
 */
export function meetsQuestion(q: Pick<FormQuestion, "expected_answer" | "min_number">, answer: string | null): boolean | null {
  if (q.expected_answer != null) return answer === q.expected_answer;
  if (q.min_number != null) return answer != null && answer !== "" && Number(answer) >= q.min_number;
  return null;
}

/** Comprobación anti-robots: campo trampa vacío y tiempo razonable de llenado. */
export function botCheck(honeypot: string, startedAt: string, now = Date.now()): string | null {
  if (honeypot.trim() !== "") return "bot";
  const t = Number(startedAt);
  if (!Number.isFinite(t) || t <= 0) return "Recargue la página e intente de nuevo.";
  const elapsed = now - t;
  if (elapsed < MIN_FILL_MS) return "bot";
  if (elapsed > MAX_FILL_MS) return "La página caducó: recárguela e intente de nuevo.";
  return null;
}

/** Código de un enlace público (el que va en /p/<código>). */
export const linkCodeSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]{8,32}$/);

// ---------------------------------------------------------------------
// Administración de formularios
// ---------------------------------------------------------------------
export const formSchema = z.object({
  vacancy_id: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || null),
  title: z.string().trim().min(3, "Título: mínimo 3 caracteres.").max(150, "Título: máximo 150 caracteres."),
  intro: z.string().trim().max(2000, "Presentación: máximo 2.000 caracteres.").optional().transform((v) => v || null),
  require_cv: z.string().optional().transform((v) => v === "on"),
  closes_at: z.union([z.literal(""), z.iso.date({ error: "Fecha inválida." })]).optional().transform((v) => v || null),
});

export const questionSchema = z
  .object({
    form_id: z.uuid(),
    label: z.string().trim().min(3, "Pregunta: mínimo 3 caracteres.").max(300, "Pregunta: máximo 300 caracteres."),
    kind: z.enum(QUESTION_KINDS, { error: "Seleccione el tipo de respuesta." }),
    options: z.string().optional().transform((v) =>
      (v ?? "")
        .split(/\r?\n|;/)
        .map((o) => o.trim())
        .filter(Boolean)
        .slice(0, 20),
    ),
    required: z.string().optional().transform((v) => v === "on"),
    expected_answer: z.string().trim().max(100).optional().transform((v) => v || null),
    min_number: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^\d{1,6}(\.\d{1,2})?$/.test(v), "Mínimo: número válido.")
      .transform((v) => (v ? Number(v) : null)),
  })
  .superRefine((q, ctx) => {
    if (q.kind === "opcion" && q.options.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Indique al menos dos opciones (una por línea)." });
    if (q.kind === "opcion" && q.expected_answer && !q.options.includes(q.expected_answer))
      ctx.addIssue({ code: "custom", path: ["expected_answer"], message: "La respuesta esperada debe ser una de las opciones." });
    if (q.kind === "si_no" && q.expected_answer && !["si", "no"].includes(q.expected_answer))
      ctx.addIssue({ code: "custom", path: ["expected_answer"], message: "Respuesta esperada inválida." });
    if (q.kind !== "si_no" && q.kind !== "opcion" && q.expected_answer)
      ctx.addIssue({ code: "custom", path: ["expected_answer"], message: "Solo las preguntas Sí/No u Opción tienen respuesta esperada." });
    if (q.kind !== "numero" && q.min_number != null) ctx.addIssue({ code: "custom", path: ["min_number"], message: "Solo las preguntas numéricas tienen mínimo." });
  })
  .transform((q) => ({ ...q, options: q.kind === "opcion" ? q.options : [] }));

export const linkSchema = z.object({
  form_id: z.uuid(),
  intake_channel_id: z.uuid({ error: "Seleccione el canal de recepción." }),
  label: z.string().trim().max(100, "Etiqueta: máximo 100 caracteres.").optional().transform((v) => v || null),
});

/** URL pública de un enlace a partir del origen del sitio. */
export function publicLinkUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/p/${code}`;
}
