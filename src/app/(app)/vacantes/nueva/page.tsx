import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { Alert } from "@/components/ui/alert";
import { VacancyForm, type VacancyDefaults } from "@/modules/vacancies/vacancy-form";
import { createVacancyAction } from "@/modules/vacancies/actions";
import { getRequisition, listRequisitionsForVacancies } from "@/modules/requisitions/repository";
import { listAssignableUsers } from "@/modules/common/options";
import { listJobPositions } from "@/modules/catalogs/repository";
import { pagePermission } from "@/lib/auth/guards";
import { isUuid } from "@/lib/ids";
import { requisitionCoverage } from "@/modules/workflow";
import { param, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Nueva vacante" };

export default async function NuevaVacantePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { allowed } = await pagePermission("vacantes:crear");
  if (!allowed) return <Forbidden message="Solo administradores y coordinadores pueden crear vacantes." />;
  const sp = await searchParams;
  const reqId = param(sp, "requisicion");
  const [requisitions, positions, users, source] = await Promise.all([
    listRequisitionsForVacancies(),
    listJobPositions(),
    listAssignableUsers(),
    isUuid(reqId) ? getRequisition(reqId) : Promise.resolve(null),
  ]);
  // Datos heredados de la requisición (se pueden ajustar).
  const defaults: VacancyDefaults | undefined = source
    ? {
        requisition_id: source.id,
        title: source.title,
        position_id: source.position_id ?? null,
        // Plazas aún disponibles para publicar (las vacantes en borrador no comprometen plazas).
        openings: Math.max(1, requisitionCoverage(source.positions_count, source.vacancies).available),
        province: source.province ?? null,
        modality: source.modality ?? "presencial",
        work_schedule: source.work_schedule ?? null,
        salary_min: source.salary_min,
        salary_max: source.salary_max,
        currency: source.currency,
        priority: source.priority,
        closes_at: source.target_date,
        recruiter_id: source.assigned_recruiter_id ?? null,
      }
    : undefined;

  return (
    <>
      <PageHeader title="Nueva vacante" description="Los datos de la requisición se copian como punto de partida." />
      {requisitions.data.length === 0 ? (
        <Alert className="mb-4">No hay requisiciones aprobadas o en proceso. Apruebe una requisición para crear vacantes.</Alert>
      ) : null}
      <VacancyForm
        // Se vuelve a montar al cambiar de requisición para mostrar sus datos.
        key={source?.id ?? "sin-requisicion"}
        action={createVacancyAction}
        defaults={defaults}
        requisitions={requisitions.data}
        positions={positions.data}
        users={users.data}
        cancelHref={source ? `/requisiciones/${source.id}` : "/vacantes"}
      />
    </>
  );
}
