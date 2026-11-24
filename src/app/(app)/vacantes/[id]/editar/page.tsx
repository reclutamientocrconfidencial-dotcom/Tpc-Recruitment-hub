import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { Flash } from "@/components/ui/flash";
import { VacancyForm } from "@/modules/vacancies/vacancy-form";
import { updateVacancyAction } from "@/modules/vacancies/actions";
import { getVacancy } from "@/modules/vacancies/repository";
import { listAssignableUsers } from "@/modules/common/options";
import { listJobPositions } from "@/modules/catalogs/repository";
import { pagePermission } from "@/lib/auth/guards";
import { isUuid } from "@/lib/ids";
import { param, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Editar vacante" };

export default async function EditarVacantePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  // Edición completa solo para administración y coordinación (la BD también lo exige).
  const { allowed } = await pagePermission("vacantes:crear");
  if (!allowed) return <Forbidden message="Solo administradores y coordinadores pueden editar los datos de una vacante." />;
  const [vacancy, positions, users] = await Promise.all([getVacancy(id), listJobPositions(), listAssignableUsers()]);
  if (!vacancy) notFound();
  return (
    <>
      <PageHeader title={`Editar: ${vacancy.title}`} description={`${vacancy.code} · el estado y las plazas cubiertas se gestionan desde la ficha.`} />
      <Flash code={param(sp, "ok")} />
      <VacancyForm action={updateVacancyAction} vacancy={vacancy} positions={positions.data} users={users.data} cancelHref={`/vacantes/${id}`} />
    </>
  );
}
