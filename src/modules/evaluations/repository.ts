import "server-only";
import { isDemoMode } from "@/lib/env";
import { runQuery } from "@/modules/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AssessmentResult,
  AssessmentType,
  CandidateCredential,
  CredentialType,
  ExecutiveReport,
  ExpiringCredential,
  Interview,
  InterviewQuestion,
  ReportTemplate,
  VacancyAssessment,
} from "@/types/database";

export function listQuestionBank() {
  return runQuery<InterviewQuestion>(
    () => [],
    (sb) =>
      sb
        .from("interview_questions")
        .select("id, text, category, guidance, position_id, client_id, sort_order, is_active, position:job_positions(name), client:clients(name)")
        .order("is_active", { ascending: false })
        .order("sort_order")
        .order("created_at")
        .limit(1000),
  );
}

export function listAssessmentTypes() {
  return runQuery<AssessmentType>(
    () => [],
    (sb) => sb.from("assessment_types").select("id, name, description, scale_id, max_score, pass_score, is_active").order("is_active", { ascending: false }).order("name"),
  );
}

export function listCredentialTypes() {
  return runQuery<CredentialType>(
    () => [],
    (sb) => sb.from("credential_types").select("id, name, requires_expiry, alert_days, is_active").order("is_active", { ascending: false }).order("name"),
  );
}

const TEMPLATE = "id, name, version, header_text, footer_text, sections, is_active, created_at";

export function listTemplates() {
  return runQuery<ReportTemplate>(
    () => [],
    (sb) => sb.from("report_templates").select(TEMPLATE).order("created_at", { ascending: false }).limit(50),
  );
}

export function listVacancyAssessments(vacancyId: string) {
  return runQuery<VacancyAssessment>(
    () => [],
    (sb) =>
      sb
        .from("vacancy_assessments")
        .select("id, vacancy_id, assessment_type_id, requirement, min_level_id, type:assessment_types(id, name, description, scale_id, max_score, pass_score, is_active), min_level:proficiency_levels(label)")
        .eq("vacancy_id", vacancyId)
        .order("created_at"),
  );
}

export function listAssessmentResults(applicationId: string) {
  return runQuery<AssessmentResult>(
    () => [],
    (sb) =>
      sb
        .from("assessment_results")
        .select("id, application_id, assessment_type_id, status, score, level_id, evaluated_on, notes, level:proficiency_levels(label), evaluator:profiles(full_name)")
        .eq("application_id", applicationId),
  );
}

const INTERVIEW =
  "id, application_id, kind, scheduled_at, duration_min, location, interviewer_id, status, rating, recommendation, summary, completed_at, interviewer:profiles!interviews_interviewer_id_fkey(full_name)";

export function listInterviews(applicationId: string) {
  return runQuery<Interview>(
    () => [],
    (sb) => sb.from("interviews").select(INTERVIEW).eq("application_id", applicationId).order("scheduled_at", { ascending: false }),
  );
}

export async function getInterview(id: string): Promise<Interview | null> {
  if (isDemoMode()) return null;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from("interviews")
    .select(`${INTERVIEW}, answers:interview_answers(position, question_text, guidance, notes, rating)`)
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[interviews.get]", error.message);
  const i = (data as unknown as Interview | null) ?? null;
  i?.answers?.sort((a, b) => a.position - b.position);
  return i;
}

export async function getReport(applicationId: string): Promise<ExecutiveReport | null> {
  if (isDemoMode()) return null;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from("executive_reports")
    .select(`id, application_id, template_id, status, version, content, recommendation, finalized_at, updated_at, template:report_templates(${TEMPLATE}), finalizer:profiles!executive_reports_finalized_by_fkey(full_name)`)
    .eq("application_id", applicationId)
    .maybeSingle();
  if (error) console.error("[reports.get]", error.message);
  return (data as unknown as ExecutiveReport | null) ?? null;
}

export function listCandidateCredentials(candidateId: string) {
  return runQuery<CandidateCredential>(
    () => [],
    (sb) =>
      sb
        .from("candidate_credentials")
        .select("id, candidate_id, credential_type_id, identifier, issued_on, expires_on, document_id, verified_at, notes, type:credential_types(name, alert_days), verifier:profiles!candidate_credentials_verified_by_fkey(full_name)")
        .eq("candidate_id", candidateId)
        .order("expires_on", { ascending: true, nullsFirst: false }),
  );
}

export async function listExpiringCredentials(days = 60): Promise<{ data: ExpiringCredential[]; error: string | null }> {
  if (isDemoMode()) return { data: [], error: null };
  try {
    const sb = await createSupabaseServerClient();
    const { data, error } = await sb.rpc("expiring_credentials", { p_days: days });
    if (error) {
      console.error("[credentials.expiring]", error.message);
      return { data: [], error: "No fue posible cargar los vencimientos." };
    }
    return { data: (data ?? []) as ExpiringCredential[], error: null };
  } catch {
    return { data: [], error: "No fue posible conectar con la base de datos." };
  }
}

/** Hoy en Costa Rica (AAAA-MM-DD). */
export function todayCR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
}
