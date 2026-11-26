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
  // Fase 2B
  position_id?: string | null;
  work_schedule?: string | null;
  province?: CrProvince | null;
  modality?: WorkModality | null;
  requested_by_name?: string | null;
  justification?: string | null;
  assigned_recruiter_id?: string | null;
  approved_at?: string | null;
  position?: { id: string; name: string } | null;
  recruiter?: { id: string; full_name: string } | null;
  approver?: { id: string; full_name: string } | null;
  vacancies?: Array<{ id: string; openings: number; filled_count: number; status: VacancyStatus }>;
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
  requisition?: { id: string; code: string; client_id?: string; status?: RequisitionStatus; positions_count?: number; client: Pick<Client, "id" | "name"> | null } | null;
  // Fase 2B
  description?: string | null;
  location_detail?: string | null;
  position_id?: string | null;
  work_schedule?: string | null;
  priority?: PriorityLevel;
  filled_count?: number;
  recruiter_id?: string | null;
  source_vacancy_id?: string | null;
  position?: { id: string; name: string } | null;
  recruiter?: { id: string; full_name: string } | null;
}

export const PRIORITY_LEVELS = ["baja", "media", "alta", "urgente"] as const;
export const REQUISITION_STATUSES = ["borrador", "pendiente_aprobacion", "aprobada", "en_proceso", "cerrada", "cancelada"] as const;
export const VACANCY_STATUSES = ["borrador", "abierta", "pausada", "cerrada", "cubierta"] as const;
export const WORK_MODALITIES = ["presencial", "remoto", "hibrido"] as const;
export const EMPLOYMENT_TYPES = ["tiempo_completo", "medio_tiempo", "temporal", "por_servicios"] as const;
export const CURRENCIES = ["CRC", "USD"] as const;

export interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  /** @deprecated Fase 2C: los datos de contacto están en candidate_private (siempre null aquí). */
  email?: string | null;
  /** @deprecated Fase 2C: ver candidate_private. */
  phone?: string | null;
  province: CrProvince | null;
  current_title: string | null;
  years_experience: number | null;
  english_level: string | null;
  source: string | null;
  consent_given: boolean;
  created_at: string;
  // Fase 2C
  canton?: string | null;
  district?: string | null;
  locality?: string | null;
  intake_channel_id?: string | null;
  source_detail?: string | null;
  status?: CandidateStatus;
  owner_id?: string | null;
  merged_into_id?: string | null;
  consent_at?: string | null;
  updated_at?: string;
  import_batch_id?: string | null;
  channel?: { id: string; name: string } | null;
  owner?: { id: string; full_name: string } | null;
  profiles?: Array<{ is_primary: boolean; position: { id: string; name: string } | null }>;
  creator?: { full_name: string } | null;
  updater?: { full_name: string } | null;
}

export const CANDIDATE_STATUSES = ["activo", "no_contactar", "archivado", "fusionado"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];
export const ENGLISH_LEVELS = ["ninguno", "A1", "A2", "B1", "B2", "C1", "C2", "nativo"] as const;
export const NATIONAL_ID_TYPES = ["cedula", "dimex", "pasaporte", "otro"] as const;
export const CONSENT_CHANNELS = ["formulario_web", "formulario_fisico", "correo", "telefono", "presencial", "importacion", "otro"] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

/** Datos sensibles (solo mediante get_candidate_private, que registra la lectura). */
export interface CandidatePrivate {
  national_id_type: (typeof NATIONAL_ID_TYPES)[number] | null;
  national_id: string | null;
  email: string | null;
  phone: string | null;
  phone_alt: string | null;
  expected_salary: number | null;
  salary_currency: CurrencyCode;
  confidential_notes: string | null;
}

export interface ConsentText {
  id: string;
  version: string;
  title: string;
  body: string;
  is_active: boolean;
  legal_approved: boolean;
  legal_note: string | null;
  created_at: string;
}

export interface CandidateConsent {
  id: string;
  consent_text_id: string;
  channel: ConsentChannel;
  evidence: string | null;
  given_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  text?: { version: string; title: string } | null;
}

export interface DuplicateMatch {
  candidate_id: string;
  full_name: string;
  reasons: string[];
  blocking: boolean;
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
  vacancy?: (Pick<Vacancy, "id" | "code" | "title"> & { status?: VacancyStatus; requisition?: { client: Pick<Client, "id" | "name"> | null } | null }) | null;
  // Fase 2D
  stage_id?: string | null;
  discard_reason?: DiscardReason | null;
  discard_note?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
  hired_at?: string | null;
  recruiter_id?: string | null;
  vstage?: Pick<VacancyStage, "id" | "name" | "category" | "position" | "target_days"> | null;
  recruiter?: { id: string; full_name: string } | null;
}

export interface VacancyStage {
  id: string;
  vacancy_id: string;
  position: number;
  name: string;
  category: StageCategory;
  stage_type: StageType;
  target_days: number | null;
  is_active: boolean;
}

export const DISCARD_REASONS = [
  "no_cumple_requisitos",
  "no_se_presento",
  "no_responde",
  "rechazo_oferta",
  "retiro_voluntario",
  "seleccionado_otro",
  "expectativa_salarial",
  "cliente_descarta",
  "otro",
] as const;
export type DiscardReason = (typeof DISCARD_REASONS)[number];
export const REQUIREMENT_CHECK_STATUSES = ["pendiente", "cumple", "no_cumple", "no_aplica"] as const;
export type RequirementCheckStatus = (typeof REQUIREMENT_CHECK_STATUSES)[number];

export interface ApplicationEvent {
  id: number;
  event_type: "creada" | "cambio_etapa" | "calificacion" | "requisito" | "nota" | "proximo_paso";
  detail: string | null;
  created_at: string;
  from_stage?: { name: string } | null;
  to_stage?: { name: string } | null;
  actor?: { full_name: string } | null;
}

export interface ApplicationNote {
  id: string;
  body: string;
  visibility: "equipo" | "confidencial";
  created_at: string;
  author?: { full_name: string } | null;
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
  catalog_stage_id?: string | null;
  position: number;
  name: string;
  category: StageCategory;
  stage_type: StageType;
  target_days: number | null;
}

export interface PipelineTemplate {
  id: string;
  client_id: string | null;
  position_id?: string | null;
  vacancy_id?: string | null;
  position?: Pick<JobPosition, "id" | "name"> | null;
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
  position_id?: string | null;
  catalog_requirement_id?: string | null;
  min_level_id?: string | null;
  position_title: string | null;
  requirement: string;
  requirement_type: RequirementType;
  category: RequirementCategory;
  expected_level: string | null;
  weight: number;
  is_active: boolean;
}

// ---------------------- Fase 2A (mejoras): catálogos -------------------
export interface StageCatalogItem {
  id: string;
  name: string;
  category: StageCategory;
  stage_type: StageType;
  default_target_days: number | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface JobPosition {
  id: string;
  name: string;
  area: string | null;
  description: string | null;
  is_active: boolean;
}

export interface ProficiencyLevel {
  id: string;
  scale_id: string;
  position: number;
  label: string;
  is_active: boolean;
}

export interface ProficiencyScale {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  levels: ProficiencyLevel[];
}

export interface RequirementCatalogItem {
  id: string;
  name: string;
  category: RequirementCategory;
  scale_id: string | null;
  description: string | null;
  is_active: boolean;
}

/** Historial de cambios del catálogo de requisitos (migración 0830). */
export interface RequirementCatalogChange {
  id: string;
  changed_at: string;
  old_name: string | null;
  new_name: string | null;
  old_category: RequirementCategory | null;
  new_category: RequirementCategory | null;
  old_scale_id: string | null;
  new_scale_id: string | null;
  old_description: string | null;
  new_description: string | null;
  old_is_active: boolean | null;
  new_is_active: boolean | null;
  templates_updated: number;
  author: { full_name: string } | null;
}

// ---------------------------------------------------------------------
// Fase 3 (migración 1200): recepción de candidatos
// ---------------------------------------------------------------------
export const QUESTION_KINDS = ["si_no", "opcion", "numero", "texto"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const SUBMISSION_STATUSES = ["incorporado", "revision", "vinculado", "creado", "descartado"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const CV_MIME_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;
export type CvMime = (typeof CV_MIME_TYPES)[number];

export interface FormQuestion {
  id: string;
  form_id: string;
  position: number;
  label: string;
  kind: QuestionKind;
  options: string[];
  required: boolean;
  expected_answer: string | null;
  min_number: number | null;
  is_active: boolean;
}

export interface FormLink {
  id: string;
  form_id: string;
  code: string;
  intake_channel_id: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
  channel?: { name: string } | null;
}

export interface PublicFormRow {
  id: string;
  vacancy_id: string | null;
  title: string;
  intro: string | null;
  require_cv: boolean;
  is_active: boolean;
  closes_at: string | null;
  created_at: string;
  vacancy?: { id: string; code: string; title: string; status: VacancyStatus } | null;
  questions?: FormQuestion[];
  links?: FormLink[];
}

/** Lo que el público ve de un formulario (función get_public_form). */
export interface PublicFormView {
  available: boolean;
  title?: string;
  intro?: string | null;
  require_cv?: boolean;
  vacancy?: {
    title: string;
    description: string | null;
    province: string | null;
    location_detail: string | null;
    modality: WorkModality | null;
    employment_type: EmploymentType | null;
    work_schedule: string | null;
    closes_at: string | null;
  } | null;
  questions?: Array<Pick<FormQuestion, "id" | "position" | "label" | "kind" | "options" | "required">>;
  consent?: { id: string; version: string; title: string; body: string } | null;
  cantons?: Array<{ province: string; name: string }>;
  positions?: Array<{ id: string; name: string }> | null;
}

export interface IntakeSubmission {
  id: string;
  link_id: string;
  form_id: string;
  vacancy_id: string | null;
  status: SubmissionStatus;
  full_name: string;
  data: Record<string, string> | null;
  match_candidate_id: string | null;
  match_reasons: string[];
  candidate_id: string | null;
  application_id: string | null;
  consent_evidence: string;
  preselection_ok: boolean | null;
  cv_path: string | null;
  cv_mime: string | null;
  cv_size: number | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  form?: { title: string } | null;
  vacancy?: { id: string; code: string; title: string } | null;
  channel?: { name: string } | null;
  link?: { code: string; label: string | null } | null;
  match?: { id: string; first_name: string; last_name: string } | null;
  reviewer?: { full_name: string } | null;
  answers?: Array<{ position: number; question_label: string; answer: string | null; meets: boolean | null }>;
}

export interface CandidateDocument {
  id: string;
  candidate_id: string;
  kind: "curriculum" | "credencial" | "otro";
  file_name: string;
  mime: CvMime;
  size_bytes: number;
  source: "formulario" | "personal";
  created_at: string;
  uploader?: { full_name: string } | null;
}

// ---------------------------------------------------------------------
// Fase 4 (migración 1300): entrevistas, evaluaciones, credenciales e informe
// ---------------------------------------------------------------------
export const QUESTION_CATEGORIES = ["competencia", "tecnica", "motivacional", "situacional", "cultura", "otra"] as const;
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];
export const INTERVIEW_KINDS = ["telefonica", "virtual", "presencial", "cliente"] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];
export const INTERVIEW_STATUSES = ["programada", "realizada", "cancelada", "no_asistio"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export const RECOMMENDATIONS = ["recomendado", "con_reservas", "no_recomendado"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export const ASSESSMENT_REQUIREMENTS = ["obligatoria", "deseable", "no_aplica"] as const;
export type AssessmentRequirement = (typeof ASSESSMENT_REQUIREMENTS)[number];
export const ASSESSMENT_STATUSES = ["pendiente", "aprobada", "reprobada", "no_presento"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export interface InterviewQuestion {
  id: string;
  text: string;
  category: QuestionCategory;
  guidance: string | null;
  position_id: string | null;
  client_id: string | null;
  sort_order: number;
  is_active: boolean;
  position?: { name: string } | null;
  client?: { name: string } | null;
}

export interface AssessmentType {
  id: string;
  name: string;
  description: string | null;
  scale_id: string | null;
  max_score: number | null;
  pass_score: number | null;
  is_active: boolean;
  /** Migración 1700: tipo y criterios sugeridos. */
  kind?: AssessmentKind;
  criteria?: AssessmentCriterion[];
}

export const ASSESSMENT_KINDS = ["entrevista", "excel", "ingles", "tecnica", "caso_practico", "assessment_center", "campo", "referencias", "psicometrica", "otra"] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];
export interface AssessmentCriterion {
  name: string;
  weight: number;
  score?: number;
}

export interface CredentialType {
  id: string;
  name: string;
  requires_expiry: boolean;
  alert_days: number;
  is_active: boolean;
}

export interface VacancyAssessment {
  id: string;
  vacancy_id: string;
  assessment_type_id: string;
  requirement: AssessmentRequirement;
  min_level_id: string | null;
  type?: AssessmentType | null;
  min_level?: { label: string } | null;
  weight?: number;
  criteria?: AssessmentCriterion[] | null;
  criteria_approved_at?: string | null;
  approver?: { full_name: string } | null;
}

export interface AssessmentResult {
  id: string;
  application_id: string;
  assessment_type_id: string;
  status: AssessmentStatus;
  score: number | null;
  level_id: string | null;
  evaluated_on: string | null;
  notes: string | null;
  level?: { label: string } | null;
  evaluator?: { full_name: string } | null;
  criteria_scores?: AssessmentCriterion[] | null;
  normalized?: number | null;
}

export interface Interview {
  id: string;
  application_id: string;
  kind: InterviewKind;
  scheduled_at: string;
  duration_min: number;
  location: string | null;
  interviewer_id: string | null;
  status: InterviewStatus;
  rating: number | null;
  recommendation: Recommendation | null;
  summary: string | null;
  completed_at: string | null;
  interviewer?: { full_name: string } | null;
  answers?: InterviewAnswer[];
}

export interface InterviewAnswer {
  position: number;
  question_text: string;
  guidance: string | null;
  notes: string | null;
  rating: number | null;
  /** Migración 1700: origen, competencia evaluada y objetivo de la pregunta. */
  origin?: "banco" | "ia" | "manual";
  competency?: string | null;
  objective?: string | null;
}

export interface CandidateCredential {
  id: string;
  candidate_id: string;
  credential_type_id: string;
  identifier: string | null;
  issued_on: string | null;
  expires_on: string | null;
  document_id: string | null;
  verified_at: string | null;
  notes: string | null;
  type?: { name: string; alert_days: number } | null;
  verifier?: { full_name: string } | null;
}

export interface ReportSection {
  key: string;
  title: string;
  help?: string;
}

export interface ReportTemplate {
  id: string;
  name: string;
  version: string;
  header_text: string | null;
  footer_text: string | null;
  sections: ReportSection[];
  is_active: boolean;
  created_at: string;
}

export interface ExecutiveReport {
  id: string;
  application_id: string;
  template_id: string;
  status: "borrador" | "final";
  version: number;
  content: Record<string, string>;
  recommendation: Recommendation | null;
  finalized_at: string | null;
  updated_at: string;
  template?: ReportTemplate | null;
  finalizer?: { full_name: string } | null;
}

export interface ExpiringCredential {
  credential_id: string;
  candidate_id: string;
  candidate_name: string;
  credential: string;
  expires_on: string;
  days_left: number;
}

// ---------------------------------------------------------------------
// Fase 6 (migración 1500): tareas, calendario e indicadores
// ---------------------------------------------------------------------
export const TASK_KINDS = ["seguimiento_cliente", "llamada", "recordatorio", "otro"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const TASK_STATUSES = ["pendiente", "hecha", "cancelada"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: string;
  title: string;
  kind: TaskKind;
  due_at: string;
  status: TaskStatus;
  notes: string | null;
  assigned_to: string;
  client_id: string | null;
  vacancy_id: string | null;
  application_id: string | null;
  completed_at: string | null;
  assignee?: { full_name: string } | null;
  client?: { name: string } | null;
  vacancy?: { code: string; title: string } | null;
}

export interface ProductivityRow {
  user_id: string;
  full_name: string;
  applications_created: number;
  stage_moves: number;
  interviews_done: number;
  reports_finalized: number;
  hires: number;
  avg_days_to_hire: number | null;
  tasks_done: number;
  tasks_overdue: number;
}
