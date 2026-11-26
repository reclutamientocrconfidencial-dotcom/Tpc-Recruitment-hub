import { z } from "zod";
import { cvProfileSchema, type CvProfile } from "@/lib/cv/profile";
import { parseCvText } from "@/lib/cv/parse";
import { simulatePreselection, simulateInterviewQuestions, simulateInterviewConclusions } from "@/lib/ai/simulations";

/**
 * Funciones de IA: esquema del resultado (salida estructurada), instrucciones
 * del sistema y un resultado SIMULADO determinista para desarrollo y pruebas
 * (sin enviar datos a ningún proveedor).
 */
export const AI_FEATURES = [
  "extraer_cv", "comparar", "preguntas", "borrador_informe", "publicacion",
  "preseleccion", "preguntas_entrevista", "conclusiones_entrevista",
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const AI_FEATURE_LABEL: Record<AiFeature, string> = {
  extraer_cv: "Extracción del perfil desde el CV",
  comparar: "Comparación vacante ↔ candidato",
  preguntas: "Preguntas de entrevista sugeridas",
  borrador_informe: "Borrador del informe ejecutivo",
  publicacion: "Publicación de la vacante",
  preseleccion: "Preselección con matriz de cumplimiento",
  preguntas_entrevista: "Guion de entrevista personalizado",
  conclusiones_entrevista: "Conclusiones de la entrevista",
};

/** Estados de la matriz de cumplimiento (la IA nunca decide: solo documenta evidencia). */
export const MATCH_STATUS = ["confirmado", "parcial", "incumplido", "insuficiente"] as const;
export type MatchStatus = (typeof MATCH_STATUS)[number];
export const MATCH_LABEL: Record<MatchStatus, string> = {
  confirmado: "Cumplimiento confirmado",
  parcial: "Cumplimiento parcial",
  incumplido: "Incumplimiento documentado",
  insuficiente: "Información insuficiente",
};

const preselectionSchema = z.object({
  resumen: z.string(),
  matriz: z.array(z.object({ requisito: z.string(), tipo: z.string(), estado: z.enum(MATCH_STATUS), evidencia: z.string(), pendiente: z.string() })),
  fortalezas: z.array(z.string()),
  brechas: z.array(z.string()),
  explorar_en_entrevista: z.array(z.string()),
});
export type Preselection = z.infer<typeof preselectionSchema>;

const interviewQuestionsSchema = z.object({
  preguntas: z.array(z.object({ texto: z.string(), competencia: z.string(), objetivo: z.string(), fundamento: z.string() })),
});
const interviewConclusionsSchema = z.object({
  resumen: z.string(),
  evidencias: z.array(z.string()),
  fortalezas: z.array(z.string()),
  aspectos_por_validar: z.array(z.string()),
  conclusion: z.string(),
});
export type InterviewConclusions = z.infer<typeof interviewConclusionsSchema>;

export const SCHEMAS = {
  extraer_cv: cvProfileSchema,
  comparar: z.object({
    puntaje: z.number(),
    resumen: z.string(),
    fortalezas: z.array(z.string()),
    brechas: z.array(z.string()),
    verificar_en_entrevista: z.array(z.string()),
  }),
  preguntas: z.object({
    preguntas: z.array(z.object({ texto: z.string(), categoria: z.enum(["competencia", "tecnica", "motivacional", "situacional", "cultura", "otra"]), que_observar: z.string() })),
  }),
  borrador_informe: z.object({
    secciones: z.array(z.object({ clave: z.string(), texto: z.string() })),
  }),
  publicacion: z.object({
    titulo: z.string(),
    texto: z.string(),
    etiquetas: z.array(z.string()),
  }),
  preseleccion: preselectionSchema,
  preguntas_entrevista: interviewQuestionsSchema,
  conclusiones_entrevista: interviewConclusionsSchema,
} as const;

export type AiOutput<F extends AiFeature> = z.infer<(typeof SCHEMAS)[F]>;

const COMMON =
  "Eres un asistente de reclutamiento de The People Outsourcing Company (Costa Rica). Respondes en español de Costa Rica, " +
  "con lenguaje claro, respetuoso y sin sesgos. No inventes datos: si algo no aparece en la información, dilo. " +
  "Los datos personales vienen seudonimizados con marcadores como [CANDIDATO], [CORREO] o [TELEFONO]: consérvalos tal cual " +
  "y nunca intentes deducir la identidad. No consideres edad, sexo, estado civil, religión, origen, discapacidad ni otros " +
  "criterios discriminatorios ni características personales ajenas a las competencias laborales. Nunca recomiendes " +
  "descartar ni contratar: la decisión es siempre humana. Tu resultado es un borrador que una persona revisará antes de usarlo.";

export const SYSTEM_PROMPTS: Record<AiFeature, string> = {
  extraer_cv:
    `${COMMON} Tarea: extraer del texto de un currículum su información profesional, SOLO lo que aparece escrito: formación académica ` +
    "(título, institución, período), trayectoria laboral (cargo, empresa, desde, hasta, funciones y logros por separado), años de " +
    "experiencia total (sin contar dos veces períodos superpuestos), experiencia específica relevante, habilidades técnicas, idiomas con " +
    "nivel MCER (A1–C2; «Sin indicar» si no se menciona), certificaciones, licencias y conocimientos especializados, más un resumen " +
    "de 2 a 3 oraciones. Deja vacío lo que no aparezca. No incluyas datos personales, edad, estado civil, fotografía ni similares.",
  comparar: `${COMMON} Tarea: comparar el perfil de un candidato con los requisitos de una vacante. Da un puntaje de afinidad de 0 a 100 basado solo en la evidencia, fortalezas, brechas y aspectos a verificar en la entrevista.`,
  preguntas: `${COMMON} Tarea: proponer de 5 a 8 preguntas de entrevista para la vacante descrita, cada una con su categoría y qué observar en la respuesta. Evita preguntas sobre vida privada.`,
  borrador_informe: `${COMMON} Tarea: redactar un borrador de cada sección del informe ejecutivo indicada, usando solo la información entregada. Usa la clave de cada sección tal como se indica. Tono profesional y conciso.`,
  preseleccion:
    `${COMMON} Tarea: analizar el perfil curricular de [CANDIDATO] frente a los requisitos y funciones de la vacante. Para CADA requisito ` +
    "indica el estado: «confirmado» (evidencia explícita en el CV o verificada por el reclutador), «parcial» (evidencia incompleta o " +
    "indirecta), «incumplido» (SOLO si hay evidencia documentada de que no cumple, nunca por ausencia de datos) o «insuficiente» (no hay " +
    "información). Cita la evidencia textual y lo que queda pendiente de verificar. Agrega fortalezas, brechas y aspectos concretos a " +
    "explorar en la entrevista. No asignes puntajes ni recomiendes descartar.",
  preguntas_entrevista:
    `${COMMON} Tarea: preparar de 6 a 10 preguntas de entrevista personalizadas a partir del perfil curricular, las funciones y requisitos ` +
    "de la vacante, las competencias del puesto y los aspectos pendientes de verificar. Cada pregunta debe referirse a la experiencia " +
    "concreta del candidato (evita preguntas genéricas o repetidas), indicar la competencia evaluada, el objetivo y el fundamento " +
    "(qué dato del CV o requisito la motiva). Prohibido preguntar por edad, estado civil, hijos, embarazo, religión, salud, " +
    "orientación sexual, origen, afiliación política o sindical.",
  conclusiones_entrevista:
    `${COMMON} Tarea: organizar las respuestas registradas por el reclutador en una entrevista: resumen breve, evidencias concretas ` +
    "(hechos, cifras, ejemplos que dio el candidato), fortalezas observadas, aspectos por validar y una conclusión prudente. Usa SOLO lo " +
    "que está en las notas; si algo no se registró, dilo. No emitas una decisión de contratación.",
  publicacion: `${COMMON} Tarea: redactar una publicación atractiva e inclusiva de la vacante para redes y portales de empleo (título, texto de 120 a 200 palabras y 3 a 6 etiquetas). No menciones el nombre del cliente.`,
};

// ---------------------------------------------------------------------
// Proveedor simulado: reglas simples y deterministas a partir de la entrada.
// ---------------------------------------------------------------------
export interface SimInput {
  text?: string;
  requirements?: Array<{ name: string; type: string; status?: string }>;
  vacancyTitle?: string;
  vacancyDescription?: string | null;
  sections?: Array<{ key: string; title: string }>;
  facts?: string[];
  location?: string | null;
  modality?: string | null;
  /** Perfil curricular (seudonimizado) para preselección y guion. */
  profile?: CvProfile | null;
  /** Respuestas registradas en la entrevista. */
  answers?: Array<{ question: string; competency?: string | null; notes?: string | null; rating?: number | null }>;
  /** Aspectos pendientes de verificar. */
  pending?: string[];
}


export function simulate<F extends AiFeature>(feature: F, input: SimInput): AiOutput<F> {
  const text = input.text ?? "";
  const reqs = input.requirements ?? [];
  switch (feature) {
    case "extraer_cv":
      return parseCvText(text) as AiOutput<F>;
    case "preseleccion":
      return simulatePreselection(input) as AiOutput<F>;
    case "preguntas_entrevista":
      return simulateInterviewQuestions(input) as AiOutput<F>;
    case "conclusiones_entrevista":
      return simulateInterviewConclusions(input) as AiOutput<F>;
    case "comparar": {
      const mandatory = reqs.filter((r) => r.type === "obligatorio");
      const met = reqs.filter((r) => r.status === "cumple");
      const pending = reqs.filter((r) => !r.status || r.status === "pendiente");
      const failed = reqs.filter((r) => r.status === "no_cumple");
      const score = reqs.length ? Math.round((met.length / reqs.length) * 100) : 50;
      return {
        puntaje: score,
        resumen: `Cumple ${met.length} de ${reqs.length} requisitos (${mandatory.length} obligatorios). (Resultado simulado)`,
        fortalezas: met.map((r) => `Cumple: ${r.name}`),
        brechas: failed.map((r) => `No cumple: ${r.name}`),
        verificar_en_entrevista: pending.map((r) => `Verificar: ${r.name}`),
      } as AiOutput<F>;
    }
    case "preguntas":
      return {
        preguntas: [
          ...reqs.slice(0, 5).map((r) => ({ texto: `Describa una situación en la que aplicó «${r.name}» y el resultado obtenido.`, categoria: "tecnica" as const, que_observar: `Evidencia concreta de ${r.name}.` })),
          { texto: `¿Qué le atrae del puesto de ${input.vacancyTitle ?? "la vacante"}?`, categoria: "motivacional" as const, que_observar: "Interés genuino y conocimiento del puesto." },
          { texto: "Cuénteme de un error laboral y qué aprendió.", categoria: "situacional" as const, que_observar: "Autocrítica y aprendizaje." },
        ],
      } as AiOutput<F>;
    case "borrador_informe":
      return {
        secciones: (input.sections ?? []).map((s) => ({
          clave: s.key,
          texto: `${s.title}: ${(input.facts ?? []).slice(0, 3).join(" ") || "Sin información registrada."} (Borrador simulado; revise y complete.)`,
        })),
      } as AiOutput<F>;
    case "publicacion":
      return {
        titulo: `¡Únase a nuestro equipo! ${input.vacancyTitle ?? "Vacante"}`,
        texto: `Buscamos ${input.vacancyTitle ?? "talento"}${input.location ? ` en ${input.location}` : ""}${input.modality ? ` (modalidad ${input.modality})` : ""}. ${input.vacancyDescription ?? ""} Requisitos: ${reqs.map((r) => r.name).join(", ") || "por definir"}. Postúlese en el enlace. (Texto simulado)`.trim(),
        etiquetas: ["#Empleo", "#CostaRica", "#TPC"],
      } as AiOutput<F>;
    default:
      throw new Error("Función no válida");
  }
}
