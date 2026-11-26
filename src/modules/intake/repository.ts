import "server-only";
import { isDemoMode } from "@/lib/env";
import { runQuery } from "@/modules/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { pageRange, PAGE_SIZE, type Paged } from "@/lib/pagination";
import { DEMO_VACANCIES } from "@/lib/demo/data";
import type { CandidateDocument, IntakeSubmission, PublicFormRow, PublicFormView, SubmissionStatus } from "@/types/database";

/** Formulario de demostración (solo en modo demostración, sin base de datos). */
export const DEMO_FORM_CODE = "demo2026ficticio";
const DEMO_PUBLIC_FORM: PublicFormView = {
  available: true,
  title: "Postúlese: Ejecutivo(a) de ventas corporativas",
  intro: "Formulario de demostración con datos ficticios. Los envíos no se guardan.",
  require_cv: true,
  vacancy: {
    title: DEMO_VACANCIES[0]!.title,
    description: "Vacante ficticia de demostración.",
    province: "San José",
    location_detail: null,
    modality: "hibrido",
    employment_type: "tiempo_completo",
    work_schedule: "Lunes a viernes",
    closes_at: "2026-12-15",
  },
  questions: [
    { id: "aaaaaaaa-1111-4000-8000-000000000001", position: 1, label: "¿Cuenta con licencia de conducir B1 vigente?", kind: "si_no", options: [], required: true },
    { id: "aaaaaaaa-1111-4000-8000-000000000002", position: 2, label: "Años de experiencia en ventas", kind: "numero", options: [], required: true },
    { id: "aaaaaaaa-1111-4000-8000-000000000003", position: 3, label: "Horario preferido", kind: "opcion", options: ["Diurno", "Mixto"], required: false },
  ],
  consent: {
    id: "aaaaaaaa-2222-4000-8000-000000000001",
    version: "demo",
    title: "Consentimiento informado (demostración)",
    body: "Texto ficticio de demostración. En TEST y producción se muestra el texto vigente aprobado por la empresa.",
  },
  cantons: [
    { province: "San José", name: "San José" },
    { province: "Heredia", name: "Heredia" },
  ],
  positions: null,
};

/** Formulario público por código (cliente anónimo: solo la función acotada). */
export async function getPublicForm(code: string): Promise<PublicFormView> {
  if (isDemoMode()) return code === DEMO_FORM_CODE ? DEMO_PUBLIC_FORM : { available: false };
  try {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.rpc("get_public_form", { p_code: code });
    if (error) {
      console.error("[intake.publicForm]", error.code);
      return { available: false };
    }
    return (data as PublicFormView | null) ?? { available: false };
  } catch (err) {
    console.error("[intake.publicForm]", err);
    return { available: false };
  }
}

// ---------------------------------------------------------------------
// Personal autorizado (RLS)
// ---------------------------------------------------------------------
const FORM_LIST = "id, vacancy_id, title, require_cv, is_active, closes_at, created_at, vacancy:vacancies(id, code, title, status), links:form_links(id, code, is_active)";

export function listForms() {
  return runQuery<PublicFormRow>(
    () => [],
    (sb) => sb.from("public_forms").select(FORM_LIST).order("is_active", { ascending: false }).order("created_at", { ascending: false }).limit(500),
  );
}

export async function getForm(id: string): Promise<PublicFormRow | null> {
  if (isDemoMode()) return null;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from("public_forms")
    .select(
      "id, vacancy_id, title, intro, require_cv, is_active, closes_at, created_at, vacancy:vacancies(id, code, title, status), " +
        "questions:form_questions(id, form_id, position, label, kind, options, required, expected_answer, min_number, is_active), " +
        "links:form_links(id, form_id, code, intake_channel_id, label, is_active, created_at, channel:intake_channels(name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[intake.getForm]", error.message);
  const form = (data as unknown as PublicFormRow | null) ?? null;
  form?.questions?.sort((a, b) => a.position - b.position);
  form?.links?.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return form;
}

/** Vacantes abiertas o pausadas sin formulario (para crear uno). */
export function listVacanciesWithoutForm() {
  return runQuery<{ id: string; code: string; title: string }>(
    () => [],
    async (sb) => {
      const { data: used } = await sb.from("public_forms").select("vacancy_id").not("vacancy_id", "is", null).limit(5000);
      const ids = (used ?? []).map((r) => (r as { vacancy_id: string }).vacancy_id);
      let q = sb.from("vacancies").select("id, code, title").in("status", ["abierta", "pausada"]).order("code", { ascending: false }).limit(500);
      if (ids.length) q = q.not("id", "in", `(${ids.join(",")})`);
      return q;
    },
  );
}

export function listActiveChannels() {
  return runQuery<{ id: string; name: string }>(
    () => [],
    (sb) => sb.from("intake_channels").select("id, name").eq("is_active", true).order("sort_order").order("name"),
  );
}

export interface SubmissionFilters {
  status: SubmissionStatus | "";
  formId: string;
  page: number;
}

const SUBMISSION_LIST =
  "id, form_id, vacancy_id, status, full_name, match_reasons, preselection_ok, cv_path, created_at, candidate_id, " +
  "form:public_forms(title), vacancy:vacancies(id, code, title), channel:intake_channels(name), link:form_links(code, label)";

export async function searchSubmissions(f: SubmissionFilters): Promise<Paged<IntakeSubmission>> {
  const empty = { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE };
  if (isDemoMode()) return { ...empty, error: null };
  try {
    const sb = await createSupabaseServerClient();
    let q = sb.from("intake_submissions").select(SUBMISSION_LIST, { count: "exact" });
    if (f.status) q = q.eq("status", f.status);
    if (f.formId) q = q.eq("form_id", f.formId);
    const [from, to] = pageRange(f.page);
    const { data, error, count } = await q.order("created_at", { ascending: false }).range(from, to);
    if (error) {
      console.error("[intake.search]", error.message);
      return { ...empty, error: "No fue posible cargar los envíos." };
    }
    return { rows: (data ?? []) as unknown as IntakeSubmission[], total: count ?? 0, page: f.page, pageSize: PAGE_SIZE, error: null };
  } catch (err) {
    console.error("[intake.search]", err);
    return { ...empty, error: "No fue posible conectar con la base de datos." };
  }
}

/** Envíos pendientes de revisión (indicador en el menú y el tablero). */
export async function countPendingSubmissions(): Promise<number> {
  if (isDemoMode()) return 0;
  try {
    const sb = await createSupabaseServerClient();
    const { count } = await sb.from("intake_submissions").select("id", { count: "exact", head: true }).eq("status", "revision");
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function getSubmission(id: string): Promise<IntakeSubmission | null> {
  if (isDemoMode()) return null;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from("intake_submissions")
    .select(
      "id, link_id, form_id, vacancy_id, status, full_name, data, match_candidate_id, match_reasons, candidate_id, application_id, consent_evidence, " +
        "preselection_ok, cv_path, cv_mime, cv_size, reviewed_at, review_note, created_at, " +
        "form:public_forms(title), vacancy:vacancies(id, code, title), channel:intake_channels(name), link:form_links(code, label), " +
        "match:candidates!intake_submissions_match_candidate_id_fkey(id, first_name, last_name), reviewer:profiles(full_name), " +
        "answers:submission_answers(position, question_label, answer, meets)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[intake.getSubmission]", error.message);
  const s = (data as unknown as IntakeSubmission | null) ?? null;
  s?.answers?.sort((a, b) => a.position - b.position);
  return s;
}

export function listCandidateDocuments(candidateId: string) {
  return runQuery<CandidateDocument>(
    () => [],
    (sb) =>
      sb
        .from("candidate_documents")
        .select("id, candidate_id, kind, file_name, mime, size_bytes, source, created_at, uploader:profiles(full_name)")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false })
        .limit(50),
  );
}
