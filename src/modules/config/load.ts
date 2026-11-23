import "server-only";
import { getDefaultPipeline, listPositionPipelines, listRequirementTemplates } from "@/modules/config/repository";
import { listJobPositions, listRequirementCatalog, listScales, listStageCatalog } from "@/modules/catalogs/repository";

/** Carga todo lo necesario para configurar procesos y requisitos de un alcance. */
export async function loadConfiguration(clientId: string | null) {
  const [own, global, positionPipelines, requirements, stageCatalog, positions, reqCatalog, scales] = await Promise.all([
    clientId ? getDefaultPipeline(clientId) : Promise.resolve(null),
    getDefaultPipeline(null),
    listPositionPipelines(clientId),
    listRequirementTemplates(clientId),
    listStageCatalog(),
    listJobPositions(),
    listRequirementCatalog(),
    listScales(),
  ]);

  const baseTemplates = [
    ...(own ? [{ id: own.id, label: "Proceso propio del cliente" }] : []),
    ...(global ? [{ id: global.id, label: "Proceso estándar TPC" }] : []),
  ];

  return {
    own,
    global,
    positionPipelines,
    requirements,
    stageCatalog: stageCatalog.data,
    positions: positions.data,
    reqCatalog: reqCatalog.data,
    scales: scales.data,
    baseTemplates,
  };
}
