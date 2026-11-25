import "server-only";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runQuery } from "@/modules/shared";
import { DEMO_GLOBAL_PIPELINE, DEMO_INTAKE_CHANNELS, DEMO_REQUIREMENTS } from "@/lib/demo/data";
import { DEMO_STAGE_CATALOG } from "@/lib/demo/catalogs";
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

const TEMPLATE_COLUMNS =
  "id, client_id, position_id, vacancy_id, name, description, is_default, position:job_positions(id, name), stages:pipeline_stages(id, catalog_stage_id, position, name, category, stage_type, target_days)";

function sortStages(t: PipelineTemplate): PipelineTemplate {
  return { ...t, stages: [...(t.stages ?? [])].sort((a: PipelineStage, b: PipelineStage) => a.position - b.position) };
}

/** Demo: enlaza las etapas del proceso estándar con el catálogo por nombre. */
function demoGlobal(): PipelineTemplate {
  return {
    ...DEMO_GLOBAL_PIPELINE,
    stages: DEMO_GLOBAL_PIPELINE.stages.map((s) => ({ ...s, catalog_stage_id: DEMO_STAGE_CATALOG.find((c) => c.name === s.name)?.id ?? null })),
  };
}

/**
 * Proceso predeterminado de un cliente (sin puesto ni vacante), o el estándar
 * global si clientId es null. Devuelve null si el cliente no tiene uno propio.
 */
export async function getDefaultPipeline(clientId: string | null): Promise<PipelineTemplate | null> {
  if (isDemoMode()) return clientId ? null : demoGlobal();
  const sb = await createSupabaseServerClient();
  let q = sb.from("pipeline_templates").select(TEMPLATE_COLUMNS).eq("is_default", true).is("position_id", null).is("vacancy_id", null);
  q = clientId ? q.eq("client_id", clientId) : q.is("client_id", null);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error("[config.pipeline]", error.message);
    return null;
  }
  return data ? sortStages(data as unknown as PipelineTemplate) : null;
}

/** Procesos específicos por puesto (de un cliente, o globales si clientId es null). */
export async function listPositionPipelines(clientId: string | null): Promise<PipelineTemplate[]> {
  if (isDemoMode()) return [];
  const sb = await createSupabaseServerClient();
  let q = sb.from("pipeline_templates").select(TEMPLATE_COLUMNS).eq("is_default", true).not("position_id", "is", null).is("vacancy_id", null);
  q = clientId ? q.eq("client_id", clientId) : q.is("client_id", null);
  const { data, error } = await q.order("name");
  if (error) {
    console.error("[config.positionPipelines]", error.message);
    return [];
  }
  return ((data ?? []) as unknown as PipelineTemplate[])
    .map(sortStages)
    .sort((a, b) => (a.position?.name ?? "").localeCompare(b.position?.name ?? "", "es"));
}

export function listRequirementTemplates(clientId: string | null) {
  return runQuery<RequirementTemplate>(
    () => DEMO_REQUIREMENTS.filter((r) => r.client_id === clientId),
    (sb) => {
      let q = sb
        .from("requirement_templates")
        .select(
          "id, client_id, position_id, catalog_requirement_id, min_level_id, position_title, requirement, requirement_type, category, expected_level, weight, is_active",
        )
        .is("vacancy_id", null);
      q = clientId ? q.eq("client_id", clientId) : q.is("client_id", null);
      return q.order("position_title", { nullsFirst: true }).order("requirement_type").order("requirement").limit(500);
    },
  );
}

/** Clientes disponibles como origen para copiar configuración. */
export function listClientsForCopy(excludeId: string) {
  return runQuery<{ id: string; name: string }>(
    () => [],
    (sb) => sb.from("clients").select("id, name").neq("id", excludeId).order("name").limit(1000),
  );
}
