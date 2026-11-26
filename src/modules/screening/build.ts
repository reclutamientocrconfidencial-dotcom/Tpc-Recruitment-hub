import "server-only";
import { AiProviderError } from "@/lib/ai/provider";
import type { SimInput } from "@/lib/ai/features";
import type { Identifiers } from "@/lib/ai/pseudonymize";
import { candidateIdentifiers, latestCvProfile, profilePrompt, vacancyFacts, type Sb, type Subject } from "@/modules/ai/engine";

export interface BuiltScreening {
  prompt: string;
  sim: SimInput;
  ids: Identifiers;
  subject: Subject;
  /** Requisito (texto) → id, para aplicar resultados revisados. */
  requirementIds: Record<string, string>;
}

/** Entrada mínima para la preselección: perfil curricular, requisitos y funciones de la vacante. */
export async function buildScreening(sb: Sb, applicationId: string): Promise<BuiltScreening> {
  const { data: a } = await sb.from("applications").select("id, vacancy_id, candidate_id").eq("id", applicationId).maybeSingle();
  if (!a) throw new AiProviderError("No se encontró la postulación o no tiene acceso a ella.");
  const [{ v, reqs }, { ids }, cv, { data: checks }] = await Promise.all([
    vacancyFacts(sb, a.vacancy_id),
    candidateIdentifiers(sb, a.candidate_id),
    latestCvProfile(sb, a.candidate_id),
    sb.from("application_requirement_checks").select("requirement_id, status").eq("application_id", applicationId),
  ]);
  if (!cv) throw new AiProviderError("El candidato no tiene perfil curricular: lea y revise su currículum primero.");
  const status = new Map(((checks ?? []) as Array<{ requirement_id: string; status: string }>).map((c) => [c.requirement_id, c.status]));
  const applicable = reqs.filter((r) => status.get(r.id) !== "no_aplica");
  const requirements = applicable.map((r) => ({ name: r.requirement + (r.min_level ? ` (mínimo ${r.min_level.label})` : ""), type: r.requirement_type, status: status.get(r.id) }));
  const prompt = [
    `Vacante: ${v.title}${v.position ? ` (puesto: ${v.position.name})` : ""}`,
    v.description ? `Funciones y descripción del puesto: ${v.description}` : "",
    `Requisitos (tipo; verificación del reclutador):\n${requirements.map((r) => `- ${r.name} (${r.type}; ${r.status === "cumple" ? "verificado: cumple" : r.status === "no_cumple" ? "verificado: no cumple" : "sin verificar"})`).join("\n") || "- Sin requisitos configurados"}`,
    `Perfil curricular de [CANDIDATO]${cv.confirmed ? " (confirmado por el reclutador)" : " (BORRADOR sin confirmar: trate los datos con cautela)"}:\n${profilePrompt(cv.profile)}`,
  ].filter(Boolean).join("\n\n");
  return {
    prompt,
    sim: { requirements, profile: cv.profile, vacancyTitle: v.title, vacancyDescription: v.description },
    ids,
    subject: { application_id: applicationId },
    requirementIds: Object.fromEntries(applicable.map((r, i) => [requirements[i]!.name, r.id])),
  };
}
