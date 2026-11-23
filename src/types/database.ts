/**
 * Tipos de dominio que reflejan las migraciones en supabase/migrations.
 * Próximo paso (fase 2): generar los tipos oficiales con
 * `npx supabase gen types typescript --project-id <id> > src/types/supabase.ts`.
 */

export const APP_ROLES = ["admin", "coordinador", "reclutador", "consulta"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export type ClientStatus = "prospecto" | "activo" | "inactivo";
export type PriorityLevel = "baja" | "media" | "alta" | "urgente";
export type RequisitionStatus =
  | "borrador"
  | "pendiente_aprobacion"
  | "aprobada"
  | "en_proceso"
  | "cerrada"
  | "cancelada";
export type VacancyStatus = "borrador" | "abierta" | "pausada" | "cerrada" | "cubierta";
export type WorkModality = "presencial" | "remoto" | "hibrido";
export type EmploymentType = "tiempo_completo" | "medio_tiempo" | "temporal" | "por_servicios";
export type ApplicationStage =
  | "nuevo"
  | "preseleccion"
  | "entrevista"
  | "prueba_tecnica"
  | "oferta"
  | "contratado"
  | "descartado"
  | "retirado";
export type CurrencyCode = "CRC" | "USD";

export const CR_PROVINCES = [
  "San José",
  "Alajuela",
  "Cartago",
  "Heredia",
  "Guanacaste",
  "Puntarenas",
  "Limón",
] as const;
export type CrProvince = (typeof CR_PROVINCES)[number];

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
  created_at?: string;
}

export interface Client {
  id: string;
  name: string;
  legal_id: string | null;
  industry: string | null;
  status: ClientStatus;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  province: CrProvince | null;
  created_at: string;
  address?: string | null;
  notes?: string | null;
  account_manager_id?: string | null;
  updated_at?: string;
  account_manager?: Pick<Profile, "id" | "full_name"> | null;
}

export const CLIENT_STATUSES = ["prospecto", "activo", "inactivo"] as const;

export interface Requisition {
  id: string;
  code: string;
  client_id: string;
  title: string;
  department: string | null;
  positions_count: number;
  priority: PriorityLevel;
  status: RequisitionStatus;
  salary_min: number | null;
  salary_max: number | null;
  currency: CurrencyCode;
  target_date: string | null;
  created_at: string;
  client?: Pick<Client, "id" | "name"> | null;
}

export interface Vacancy {
  id: string;
  code: string;
  requisition_id: string;
  title: string;
  province: CrProvince | null;
  modality: WorkModality;
  employment_type: EmploymentType;
  status: VacancyStatus;
  openings: number;
  salary_min: number | null;
  salary_max: number | null;
  currency: CurrencyCode;
  published_at: string | null;
  closes_at: string | null;
  created_at: string;
  requisition?: { id: string; code: string; client: Pick<Client, "id" | "name"> | null } | null;
}

export interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  province: CrProvince | null;
  current_title: string | null;
  years_experience: number | null;
  english_level: string | null;
  source: string | null;
  consent_given: boolean;
  created_at: string;
}

export interface Application {
  id: string;
  vacancy_id: string;
  candidate_id: string;
  stage: ApplicationStage;
  rating: number | null;
  applied_at: string;
  stage_changed_at: string;
  candidate?: Pick<Candidate, "id" | "first_name" | "last_name"> | null;
  vacancy?: Pick<Vacancy, "id" | "code" | "title"> | null;
}

export interface DashboardMetrics {
  active_clients: number;
  open_requisitions: number;
  open_vacancies: number;
  total_candidates: number;
  active_applications: number;
  hires_this_month: number;
}

// ---------------------------- Fase 2A ---------------------------------
export const INTAKE_CHANNEL_CATEGORIES = [
  "whatsapp",
  "correo",
  "redes_sociales",
  "plataforma_empleo",
  "feria_empleo",
  "formulario",
  "referencia",
  "otro",
] as const;
export type IntakeChannelCategory = (typeof INTAKE_CHANNEL_CATEGORIES)[number];

export interface IntakeChannel {
  id: string;
  code: string;
  name: string;
  category: IntakeChannelCategory;
  detail_label: string | null;
  is_active: boolean;
  sort_order: number;
}

export const STAGE_CATEGORIES = ["nuevo", "en_proceso", "oferta", "contratado", "descartado"] as const;
export type StageCategory = (typeof STAGE_CATEGORIES)[number];
export const STAGE_TYPES = ["general", "entrevista", "prueba", "verificacion", "oferta"] as const;
export type StageType = (typeof STAGE_TYPES)[number];

export interface PipelineStage {
  id?: string;
  position: number;
  name: string;
  category: StageCategory;
  stage_type: StageType;
  target_days: number | null;
}

export interface PipelineTemplate {
  id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  is_default: boolean;
  stages: PipelineStage[];
}

export const REQUIREMENT_TYPES = ["obligatorio", "deseable"] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];
export const REQUIREMENT_CATEGORIES = [
  "formacion",
  "experiencia",
  "idioma",
  "certificacion",
  "habilidad",
  "disponibilidad",
  "otro",
] as const;
export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export interface RequirementTemplate {
  id: string;
  client_id: string | null;
  position_title: string | null;
  requirement: string;
  requirement_type: RequirementType;
  category: RequirementCategory;
  expected_level: string | null;
  weight: number;
  is_active: boolean;
}
