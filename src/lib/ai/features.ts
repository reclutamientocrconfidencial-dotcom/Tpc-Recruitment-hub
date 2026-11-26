import { z } from "zod";

/**
 * Funciones de IA: esquema del resultado (salida estructurada), instrucciones
 * del sistema y un resultado SIMULADO determinista para desarrollo y pruebas
 * (sin enviar datos a ningún proveedor).
 */
export const AI_FEATURES = ["extraer_cv", "comparar", "preguntas", "borrador_informe", "publicacion"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const AI_FEATURE_LABEL: Record<AiFeature, string> = {
  extraer_cv: "Extracción del perfil desde el CV",
  comparar: "Comparación vacante ↔ candidato",
  preguntas: "Preguntas de entrevista sugeridas",
  borrador_informe: "Borrador del informe ejecutivo",
  publicacion: "Publicación de la vacante",
};

export const SCHEMAS = {
  extraer_cv: z.object({
    resumen: z.string(),
    puesto_actual: z.string(),
    anios_experiencia: z.number(),
    habilidades: z.array(z.string()),
    idiomas: z.array(z.object({ idioma: z.string(), nivel: z.string() })),
    formacion: z.array(z.string()),
  }),
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
} as const;

export type AiOutput<F extends AiFeature> = z.infer<(typeof SCHEMAS)[F]>;

const COMMON =
  "Eres un asistente de reclutamiento de The People Outsourcing Company (Costa Rica). Respondes en español de Costa Rica, " +
  "con lenguaje claro, respetuoso y sin sesgos. No inventes datos: si algo no aparece en la información, dilo. " +
  "Los datos personales vienen seudonimizados con marcadores como [CANDIDATO], [CORREO] o [TELEFONO]: consérvalos tal cual " +
  "y nunca intentes deducir la identidad. No consideres edad, sexo, estado civil, religión, origen, discapacidad ni otros " +
  "criterios discriminatorios. Tu resultado es un borrador que una persona revisará antes de usarlo.";

export const SYSTEM_PROMPTS: Record<AiFeature, string> = {
  extraer_cv: `${COMMON} Tarea: extraer del texto de un currículum el perfil profesional (puesto actual, años de experiencia, habilidades, idiomas con nivel y formación) y un resumen de 2 a 3 oraciones.`,
  comparar: `${COMMON} Tarea: comparar el perfil de un candidato con los requisitos de una vacante. Da un puntaje de afinidad de 0 a 100 basado solo en la evidencia, fortalezas, brechas y aspectos a verificar en la entrevista.`,
  preguntas: `${COMMON} Tarea: proponer de 5 a 8 preguntas de entrevista para la vacante descrita, cada una con su categoría y qué observar en la respuesta. Evita preguntas sobre vida privada.`,
  borrador_informe: `${COMMON} Tarea: redactar un borrador de cada sección del informe ejecutivo indicada, usando solo la información entregada. Usa la clave de cada sección tal como se indica. Tono profesional y conciso.`,
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
}

const SKILLS = ["Excel", "SAP", "Power BI", "inglés", "ventas", "servicio al cliente", "inventarios", "contabilidad", "liderazgo", "negociación", "logística", "atención al cliente"];

export function simulate<F extends AiFeature>(feature: F, input: SimInput): AiOutput<F> {
  const text = input.text ?? "";
  const reqs = input.requirements ?? [];
  switch (feature) {
    case "extraer_cv": {
      const years = Math.max(0, ...[...text.matchAll(/(\d{1,2})\s*(?:años|anos)/gi)].map((m) => Number(m[1])));
      const firstLine = text.split(/\n/).map((l) => l.trim()).find((l) => l && !l.includes("[")) ?? "";
      const skills = SKILLS.filter((s) => text.toLowerCase().includes(s.toLowerCase()));
      const level = text.match(/ingl[eé]s[^.\n]*?\b(A1|A2|B1|B2|C1|C2)\b/i)?.[1]?.toUpperCase();
      return {
        resumen: `Perfil con ${years || "sin indicar"} años de experiencia${skills.length ? ` y conocimientos en ${skills.slice(0, 4).join(", ")}` : ""}. (Resultado simulado)`,
        puesto_actual: firstLine.slice(0, 80),
        anios_experiencia: years,
        habilidades: skills,
        idiomas: level ? [{ idioma: "Inglés", nivel: level }] : [],
        formacion: [...text.matchAll(/(bachiller|licenciatura|técnico|tecnico|maestría)[^.\n]*/gi)].map((m) => m[0].trim()).slice(0, 3),
      } as AiOutput<F>;
    }
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
