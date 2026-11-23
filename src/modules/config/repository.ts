import "server-only";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runQuery } from "@/modules/shared";
import { DEMO_GLOBAL_PIPELINE, DEMO_INTAKE_CHANNELS, DEMO_REQUIREMENTS } from "@/lib/demo/data";
import type { IntakeChannel, PipelineStage, PipelineTemplate, RequirementTemplate } from "@/types/database";

export function listIntakeChannels(onlyActive = false) {
  return runQuery<IntakeChannel>(
    () => DEMO_INTAKE_CHANNELS.filter((c) => !onlyActive || c.is_active),
    (sb) => {
      let q = sb.from("intake_channels").select("id, code, name, category, detail_label, is_active, sort_order");
      if (onlyActive) q = q.eq("is_active", true);
      return q.order("sort_order").order("name");
    },
  );
}

/**
 * Plantilla de proceso predeterminada de un cliente (o la global si clientId es null).
 * Devuelve null si el cliente aún no tiene una propia.
 */
export async function getDefaultPipeline(clientId: string | null): Promise<PipelineTemplate | null> {
  if (isDemoMode()) return clientId ? null : DEMO_GLOBAL_PIPELINE;
  const sb = await createSupabaseServerClient();
  let q = sb
    .from("pipeline_templates")
    .select("id, client_id, name, description, is_default, stages:pipeline_stages(id, position, name, category, stage_type, target_days)")
    .eq("is_default", true);
  q = clientId ? q.eq("client_id", clientId) : q.is("client_id", null);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error("[config.pipeline]", error.message);
    return null;
  }
  if (!data) return null;
  const t = data as unknown as PipelineTemplate;
  return { ...t, stages: [...(t.stages ?? [])].sort((a: PipelineStage, b: PipelineStage) => a.position - b.position) };
}

export function listRequirementTemplates(clientId: string | null) {
  return runQuery<RequirementTemplate>(
    () => DEMO_REQUIREMENTS.filter((r) => r.client_id === clientId),
    (sb) => {
      let q = sb
        .from("requirement_templates")
        .select("id, client_id, position_title, requirement, requirement_type, category, expected_level, weight, is_active");
      q = clientId ? q.eq("client_id", clientId) : q.is("client_id", null);
      return q.order("position_title", { nullsFirst: true }).order("requirement_type").order("requirement").limit(200);
    },
  );
}
