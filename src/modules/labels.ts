/** Etiquetas en español y tonos visuales para los estados de cada módulo. */
import type {
  CandidateStatus,
  ConsentChannel,
  IntakeChannelCategory,
  RequirementCategory,
  RequirementType,
  StageCategory,
  StageType,
  ApplicationStage,
  ClientStatus,
  EmploymentType,
  PriorityLevel,
  RequisitionStatus,
  VacancyStatus,
  WorkModality,
} from "@/types/database";

export type Tone = "neutral" | "red" | "dark" | "success" | "warning" | "muted";

export interface LabelDef {
  label: string;
  tone: Tone;
}

export const CLIENT_STATUS: Record<ClientStatus, LabelDef> = {
  prospecto: { label: "Prospecto", tone: "warning" },
  activo: { label: "Activo", tone: "success" },
  inactivo: { label: "Inactivo", tone: "muted" },
};

export const PRIORITY: Record<PriorityLevel, LabelDef> = {
  baja: { label: "Baja", tone: "muted" },
  media: { label: "Media", tone: "neutral" },
  alta: { label: "Alta", tone: "dark" },
  urgente: { label: "Urgente", tone: "red" },
};

export const REQUISITION_STATUS: Record<RequisitionStatus, LabelDef> = {
  borrador: { label: "Borrador", tone: "muted" },
  pendiente_aprobacion: { label: "Pendiente de aprobación", tone: "warning" },
  aprobada: { label: "Aprobada", tone: "success" },
  en_proceso: { label: "En proceso", tone: "red" },
  cerrada: { label: "Cerrada", tone: "dark" },
  cancelada: { label: "Cancelada", tone: "muted" },
};

export const VACANCY_STATUS: Record<VacancyStatus, LabelDef> = {
  borrador: { label: "Borrador", tone: "muted" },
  abierta: { label: "Abierta", tone: "red" },
  pausada: { label: "Pausada", tone: "warning" },
  cerrada: { label: "Cerrada", tone: "dark" },
  cubierta: { label: "Cubierta", tone: "success" },
};

export const APPLICATION_STAGE: Record<ApplicationStage, LabelDef> = {
  nuevo: { label: "Nuevo", tone: "neutral" },
  preseleccion: { label: "Preselección", tone: "warning" },
  entrevista: { label: "Entrevista", tone: "red" },
  prueba_tecnica: { label: "Prueba técnica", tone: "red" },
  oferta: { label: "Oferta", tone: "dark" },
  contratado: { label: "Contratado", tone: "success" },
  descartado: { label: "Descartado", tone: "muted" },
  retirado: { label: "Retirado", tone: "muted" },
};

export const WORK_MODALITY: Record<WorkModality, string> = {
  presencial: "Presencial",
  remoto: "Remoto",
  hibrido: "Híbrido",
};

export const EMPLOYMENT_TYPE: Record<EmploymentType, string> = {
  tiempo_completo: "Tiempo completo",
  medio_tiempo: "Medio tiempo",
  temporal: "Temporal",
  por_servicios: "Por servicios profesionales",
};

/** Etapas del embudo en orden (para el dashboard y la fase 2: tablero kanban). */
export const PIPELINE_STAGES: ApplicationStage[] = [
  "nuevo",
  "preseleccion",
  "entrevista",
  "prueba_tecnica",
  "oferta",
  "contratado",
];

export const INTAKE_CATEGORY: Record<IntakeChannelCategory, string> = {
  whatsapp: "WhatsApp",
  correo: "Correo electrónico",
  redes_sociales: "Redes sociales",
  plataforma_empleo: "Plataforma de empleo",
  feria_empleo: "Feria de empleo",
  formulario: "Formulario",
  referencia: "Referencia",
  otro: "Otro",
};

export const STAGE_CATEGORY: Record<StageCategory, LabelDef> = {
  nuevo: { label: "Nuevo", tone: "neutral" },
  en_proceso: { label: "En proceso", tone: "red" },
  oferta: { label: "Oferta", tone: "dark" },
  contratado: { label: "Contratado", tone: "success" },
  descartado: { label: "Descartado", tone: "muted" },
};

export const STAGE_TYPE: Record<StageType, string> = {
  general: "General",
  entrevista: "Entrevista",
  prueba: "Prueba",
  verificacion: "Verificación",
  oferta: "Oferta",
};

export const REQUIREMENT_TYPE: Record<RequirementType, LabelDef> = {
  obligatorio: { label: "Obligatorio", tone: "red" },
  deseable: { label: "Deseable", tone: "neutral" },
};

export const REQUIREMENT_CATEGORY: Record<RequirementCategory, string> = {
  formacion: "Formación",
  experiencia: "Experiencia",
  idioma: "Idioma",
  certificacion: "Certificación",
  habilidad: "Habilidad",
  disponibilidad: "Disponibilidad",
  otro: "Otro",
};

/** Convierte un Record de etiquetas en opciones de <select>. */
export function optionsFrom<T extends string>(map: Record<T, string | LabelDef>): Array<{ value: T; label: string }> {
  return (Object.keys(map) as T[]).map((value) => {
    const v = map[value];
    return { value, label: typeof v === "string" ? v : v.label };
  });
}

export const CANDIDATE_STATUS: Record<CandidateStatus, LabelDef> = {
  activo: { label: "Activo", tone: "success" },
  no_contactar: { label: "No contactar", tone: "red" },
  archivado: { label: "Archivado", tone: "muted" },
  fusionado: { label: "Fusionado", tone: "muted" },
};

export const CONSENT_CHANNEL: Record<ConsentChannel, string> = {
  formulario_web: "Formulario web",
  formulario_fisico: "Formulario físico firmado",
  correo: "Correo electrónico",
  telefono: "Llamada telefónica",
  presencial: "Presencial",
  importacion: "Importación (consentimiento previo documentado)",
  otro: "Otro",
};

export const NATIONAL_ID_TYPE: Record<"cedula" | "dimex" | "pasaporte" | "otro", string> = {
  cedula: "Cédula",
  dimex: "DIMEX",
  pasaporte: "Pasaporte",
  otro: "Otro",
};
