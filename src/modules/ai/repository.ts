import "server-only";
import { isDemoMode } from "@/lib/env";
import { runQuery } from "@/modules/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AiFeature } from "@/lib/ai/features";

export interface AiSettings {
  enabled: boolean;
  provider: "simulado" | "anthropic";
  model: string;
  monthly_budget_usd: number;
  daily_requests_per_user: number;
  dpa_confirmed: boolean;
  dpa_note: string | null;
  updated_at: string;
}

export interface AiRequestRow {
  id: string;
  feature: AiFeature;
  provider: string;
  model: string;
  status: "en_proceso" | "pendiente_revision" | "aceptado" | "descartado" | "error";
  output: Record<string, unknown> | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number;
  error: string | null;
  pseudonymized: boolean;
  created_at: string;
  reviewed_at: string | null;
  user?: { full_name: string } | null;
  reviewer?: { full_name: string } | null;
}

export async function getAiSettings(): Promise<AiSettings | null> {
  if (isDemoMode()) return null;
  const sb = await createSupabaseServerClient();
  const { data } = await sb.from("ai_settings").select("enabled, provider, model, monthly_budget_usd, daily_requests_per_user, dpa_confirmed, dpa_note, updated_at").maybeSingle();
  return (data as AiSettings | null) ?? null;
}

const SELECT =
  "id, feature, provider, model, status, output, input_tokens, output_tokens, cost_usd, error, pseudonymized, created_at, reviewed_at, " +
  "user:profiles!ai_requests_user_id_fkey(full_name), reviewer:profiles!ai_requests_reviewed_by_fkey(full_name)";

export function listAiRequests(subject: { application_id?: string; vacancy_id?: string; candidate_id?: string; interview_id?: string }) {
  const [col, val] = Object.entries(subject)[0] ?? ["application_id", ""];
  return runQuery<AiRequestRow>(
    () => [],
    (sb) => sb.from("ai_requests").select(SELECT).eq(col, val).order("created_at", { ascending: false }).limit(20),
  );
}

export interface AiUsage {
  month_cost: number;
  budget: number;
  requests: number;
  accepted: number;
  discarded: number;
  errors: number;
  by_feature: Record<string, number>;
  by_user: Array<{ name: string; requests: number; cost: number }>;
}

export async function getAiUsage(): Promise<AiUsage | null> {
  if (isDemoMode()) return null;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("ai_usage_summary");
  if (error) return null;
  return data as AiUsage;
}
