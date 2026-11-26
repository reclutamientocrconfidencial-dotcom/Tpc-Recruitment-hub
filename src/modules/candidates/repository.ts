import "server-only";
import { DEMO_APPLICATIONS, DEMO_CANDIDATES, DEMO_VACANCIES } from "@/lib/demo/data";
import { runQuery } from "@/modules/shared";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pageRange, paginateArray, PAGE_SIZE, type Paged } from "@/lib/pagination";
import { normalizeName, type CandidateFilters } from "@/modules/candidates/filters";
import type { ApplicationStage, Candidate, CandidateConsent, CandidatePrivate, ConsentText } from "@/types/database";

const LIST =
  "id, first_name, last_name, province, canton, district, current_title, years_experience, english_level, source, consent_given, status, owner_id, created_at, " +
  "channel:intake_channels(id, name), owner:profiles!candidates_owner_id_fkey(id, full_name), profiles:candidate_profiles(is_primary, position:job_positions(id, name))";

function demoRows(): Candidate[] {
  return DEMO_CANDIDATES.map((c) => ({ ...c, email: null, phone: null, status: "activo", profiles: [] }));
}

function matches(c: Candidate, f: CandidateFilters): boolean {
  const q = normalizeName(f.q);
  return (
    (!q || normalizeName(`${c.first_name} ${c.last_name}`).includes(q)) &&
    (!f.province || c.province === f.province) &&
    (!f.canton || (c.canton ?? "").toLowerCase().includes(f.canton.toLowerCase())) &&
    (!f.english || c.english_level === f.english) &&
    (f.minYears == null || (c.years_experience ?? 0) >= f.minYears) &&
    (f.status ? c.status === f.status : c.status !== "fusionado")
  );
}

export async function searchCandidates(f: CandidateFilters): Promise<Paged<Candidate>> {
  if (isDemoMode()) return paginateArray(demoRows().filter((c) => matches(c, f)), f.page);
  try {
    const sb = await createSupabaseServerClient();
    // Con filtro de perfil se usa un join obligatorio con los perfiles.
    const select = f.positionId ? LIST.replace("profiles:candidate_profiles(", "profiles:candidate_profiles!inner(") : LIST;
    let q = sb.from("candidates").select(select, { count: "exact" });
    if (f.q) q = q.ilike("full_name_norm", `%${normalizeName(f.q)}%`);
    if (f.province) q = q.eq("province", f.province);
    if (f.canton) q = q.ilike("canton", `%${f.canton}%`);
    if (f.positionId) q = q.eq("profiles.position_id", f.positionId);
    if (f.channelId) q = q.eq("intake_channel_id", f.channelId);
    if (f.english) q = q.eq("english_level", f.english);
    if (f.minYears != null) q = q.gte("years_experience", f.minYears);
    q = f.status ? q.eq("status", f.status) : q.neq("status", "fusionado");
    if (f.ownerId) q = q.eq("owner_id", f.ownerId);
    const [from, to] = pageRange(f.page);
    const { data, error, count } = await q.order("created_at", { ascending: false }).range(from, to);
    if (error) {
      console.error("[candidates.search]", error.message);
      return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: "No fue posible cargar los candidatos." };
    }
    return { rows: (data ?? []) as unknown as Candidate[], total: count ?? 0, page: f.page, pageSize: PAGE_SIZE, error: null };
  } catch (err) {
    console.error("[candidates.search]", err);
    return { rows: [], total: 0, page: f.page, pageSize: PAGE_SIZE, error: "No fue posible conectar con la base de datos." };
  }
}

export async function getCandidate(id: string): Promise<Candidate | null> {
  if (isDemoMode()) return demoRows().find((c) => c.id === id) ?? null;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from("candidates")
    .select(`${LIST}, locality, intake_channel_id, source_detail, consent_at, merged_into_id, updated_at, import_batch_id, creator:profiles!candidates_created_by_fkey(full_name), updater:profiles!candidates_updated_by_fkey(full_name)`)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[candidates.get]", error.message);
    return null;
  }
  return data as unknown as Candidate | null;
}

/**
 * Datos sensibles: la función de la BD valida el rol y REGISTRA la lectura.
 * Devuelve null si el usuario no está autorizado (p. ej., rol consulta).
 */
export async function getCandidatePrivate(id: string, reason: string): Promise<CandidatePrivate | null> {
  if (isDemoMode()) {
    const c = DEMO_CANDIDATES.find((x) => x.id === id);
    return c
      ? { national_id_type: null, national_id: null, email: c.email ?? null, phone: c.phone ?? null, phone_alt: null, expected_salary: null, salary_currency: "CRC", confidential_notes: null }
      : null;
  }
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("get_candidate_private", { p_candidate_id: id, p_reason: reason });
  if (error) {
    if (error.code !== "42501") console.error("[candidates.private]", error.code);
    return null;
  }
  const row = (data as CandidatePrivate[] | null)?.[0];
  return row ?? { national_id_type: null, national_id: null, email: null, phone: null, phone_alt: null, expected_salary: null, salary_currency: "CRC", confidential_notes: null };
}

export function listCandidateConsents(id: string) {
  return runQuery<CandidateConsent>(
    () => [],
    (sb) =>
      sb
        .from("candidate_consents")
        .select("id, consent_text_id, channel, evidence, given_at, revoked_at, revoke_reason, text:consent_texts(version, title)")
        .eq("candidate_id", id)
        .order("given_at", { ascending: false }),
  );
}

export interface ParticipationRow {
  id: string;
  stage: ApplicationStage;
  applied_at: string;
  stage_changed_at: string;
  vacancy: { id: string; code: string; title: string; status: string; requisition: { client: { name: string } | null } | null } | null;
}

/** Historial de participación en procesos (postulaciones visibles para el usuario). */
export function listCandidateApplications(id: string) {
  return runQuery<ParticipationRow>(
    () =>
      DEMO_APPLICATIONS.filter((a) => a.candidate_id === id).map((a) => {
        const v = DEMO_VACANCIES.find((x) => x.id === a.vacancy_id);
        return {
          id: a.id,
          stage: a.stage,
          applied_at: a.applied_at,
          stage_changed_at: a.stage_changed_at,
          vacancy: v ? { id: v.id, code: v.code, title: v.title, status: v.status, requisition: { client: v.requisition?.client ?? null } } : null,
        };
      }),
    (sb) =>
      sb
        .from("applications")
        .select("id, stage, applied_at, stage_changed_at, vacancy:vacancies(id, code, title, status, requisition:requisitions(client:clients(name)))")
        .eq("candidate_id", id)
        .order("applied_at", { ascending: false })
        .limit(100),
  );
}

export async function getActiveConsentText(): Promise<ConsentText | null> {
  if (isDemoMode()) {
    return {
      id: "88888888-0000-4000-8000-000000000001",
      version: "2026-1-BORRADOR",
      title: "Consentimiento para el tratamiento de datos personales (borrador)",
      body: "TEXTO PROVISIONAL PENDIENTE DE REVISIÓN JURÍDICA (Ley N.° 8968). Uso exclusivo con datos ficticios.",
      is_active: true,
      legal_approved: false,
      legal_note: null,
      created_at: new Date().toISOString(),
    };
  }
  const sb = await createSupabaseServerClient();
  const { data } = await sb.from("consent_texts").select("id, version, title, body, is_active, legal_approved, legal_note, created_at").eq("is_active", true).maybeSingle();
  return (data as ConsentText | null) ?? null;
}

export function listConsentTexts() {
  return runQuery<ConsentText>(
    () => [],
    (sb) => sb.from("consent_texts").select("id, version, title, body, is_active, legal_approved, legal_note, created_at").order("created_at", { ascending: false }),
  );
}

/** Cantones (catálogo territorial). */
export function listCantons() {
  return runQuery<{ province: string; name: string }>(
    () => [
      { province: "San José", name: "Escazú" },
      { province: "Heredia", name: "Belén" },
      { province: "Alajuela", name: "Grecia" },
    ],
    (sb) => sb.from("cr_cantons").select("province, name").order("province").order("name"),
  );
}

export interface DuplicatePair {
  candidate_a: string;
  name_a: string;
  candidate_b: string;
  name_b: string;
  reasons: string[];
}

export function listPossibleDuplicates() {
  return runQuery<DuplicatePair>(
    () => [],
    (sb) => sb.rpc("list_possible_duplicates", { p_limit: 200 }),
  );
}

export interface ImportBatch {
  id: string;
  file_name: string;
  status: "cargando" | "validado" | "importado" | "cancelado" | "revertido";
  consent_channel: string;
  consent_evidence: string;
  reason: string;
  row_count: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  reverted_count: number | null;
  created_at: string;
  committed_at: string | null;
  reverted_at: string | null;
  creator?: { full_name: string } | null;
}

export function listImportBatches() {
  return runQuery<ImportBatch>(
    () => [],
    (sb) =>
      sb
        .from("import_batches")
        .select("id, file_name, status, consent_channel, consent_evidence, reason, row_count, created_count, updated_count, skipped_count, reverted_count, created_at, committed_at, reverted_at, creator:profiles!import_batches_created_by_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(50),
  );
}

export async function getImportBatch(id: string): Promise<ImportBatch | null> {
  if (isDemoMode()) return null;
  const sb = await createSupabaseServerClient();
  const { data } = await sb
    .from("import_batches")
    .select("id, file_name, status, consent_channel, consent_evidence, reason, row_count, created_count, updated_count, skipped_count, reverted_count, created_at, committed_at, reverted_at, creator:profiles!import_batches_created_by_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as ImportBatch | null) ?? null;
}

export interface ImportRow {
  row_number: number;
  full_name: string | null;
  status: "valido" | "error" | "duplicado" | "posible_duplicado";
  errors: string[];
  match_candidate_id: string | null;
  match_reasons: string[];
  decision: "crear" | "actualizar" | "omitir" | null;
  result_candidate_id: string | null;
  match?: { first_name: string; last_name: string } | null;
}

/** Filas del informe (sin datos de contacto: solo nombre, estado, errores y coincidencias). */
export async function listImportRows(batchId: string, status: string, page: number): Promise<Paged<ImportRow>> {
  if (isDemoMode()) return { rows: [], total: 0, page, pageSize: PAGE_SIZE, error: null };
  const sb = await createSupabaseServerClient();
  let q = sb
    .from("import_rows")
    .select("row_number, full_name, status, errors, match_candidate_id, match_reasons, decision, result_candidate_id, match:candidates!import_rows_match_candidate_id_fkey(first_name, last_name)", { count: "exact" })
    .eq("batch_id", batchId);
  if (status) q = q.eq("status", status);
  const [from, to] = pageRange(page);
  const { data, error, count } = await q.order("row_number").range(from, to);
  if (error) {
    console.error("[candidates.importRows]", error.message);
    return { rows: [], total: 0, page, pageSize: PAGE_SIZE, error: "No fue posible cargar el informe." };
  }
  return { rows: (data ?? []) as unknown as ImportRow[], total: count ?? 0, page, pageSize: PAGE_SIZE, error: null };
}

export async function importStatusCounts(batchId: string): Promise<Record<string, number> & { sin_decision: number }> {
  const out = { valido: 0, error: 0, duplicado: 0, posible_duplicado: 0, sin_decision: 0 } as Record<string, number> & { sin_decision: number };
  if (isDemoMode()) return out;
  const sb = await createSupabaseServerClient();
  // Conteos exactos en la BD (la API limita cada consulta a 1.000 filas).
  const count = (q: ReturnType<typeof base>) => q.then((r) => r.count ?? 0);
  const base = () => sb.from("import_rows").select("row_number", { count: "exact", head: true }).eq("batch_id", batchId);
  const [valido, error, duplicado, posible, sinDecision] = await Promise.all([
    count(base().eq("status", "valido")),
    count(base().eq("status", "error")),
    count(base().eq("status", "duplicado")),
    count(base().eq("status", "posible_duplicado")),
    count(base().is("decision", null)),
  ]);
  return { ...out, valido, error, duplicado, posible_duplicado: posible, sin_decision: sinDecision };
}
