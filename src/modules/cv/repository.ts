import "server-only";
import { runQuery } from "@/modules/shared";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeProfile, type CvProfile } from "@/lib/cv/profile";

export type CvProfileStatus = "borrador" | "confirmado" | "reemplazado" | "descartado";
export type CvQuality = "legible" | "parcial" | "ilegible";

export interface CvProfileRow {
  id: string;
  candidate_id: string;
  document_id: string | null;
  source: "ia" | "simulado" | "manual";
  ai_request_id: string | null;
  status: CvProfileStatus;
  quality: CvQuality;
  quality_note: string | null;
  data: CvProfile;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  document?: { file_name: string } | null;
  confirmer?: { full_name: string } | null;
  creator?: { full_name: string } | null;
}

const SELECT =
  "id, candidate_id, document_id, source, ai_request_id, status, quality, quality_note, data, confirmed_at, created_at, updated_at, " +
  "document:candidate_documents(file_name), confirmer:profiles!candidate_cv_profiles_confirmed_by_fkey(full_name), creator:profiles!candidate_cv_profiles_created_by_fkey(full_name)";

function normalize(r: CvProfileRow): CvProfileRow {
  return { ...r, data: normalizeProfile(r.data) };
}

export async function listCvProfiles(candidateId: string) {
  const r = await runQuery<CvProfileRow>(
    () => [],
    (sb) => sb.from("candidate_cv_profiles").select(SELECT).eq("candidate_id", candidateId).neq("status", "descartado").order("created_at", { ascending: false }).limit(10),
  );
  return { ...r, data: r.data.map(normalize) };
}

export async function getCvProfile(id: string): Promise<CvProfileRow | null> {
  if (isDemoMode()) return null;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("candidate_cv_profiles").select(SELECT).eq("id", id).maybeSingle();
  if (error) console.error("[cv.get]", error.code);
  return data ? normalize(data as unknown as CvProfileRow) : null;
}
