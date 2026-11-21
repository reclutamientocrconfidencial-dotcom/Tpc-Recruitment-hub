/** Etiquetas en español y tonos visuales para los estados de cada módulo. */
import type {
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
