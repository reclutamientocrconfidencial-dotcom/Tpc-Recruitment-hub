import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { getVacancy } from "@/modules/vacancies/repository";
import { getBoard, searchCandidatesForVacancy } from "@/modules/applications/repository";
import { createApplicationAction, moveApplicationAction, syncStagesAction } from "@/modules/applications/actions";
import { KanbanBoard } from "@/modules/applications/kanban-board";
import { CoverageBar } from "@/modules/common/coverage-bar";
import { InlineAction } from "@/modules/common/inline-action";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/ids";
import { param, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Tablero de postulaciones" };

export default async function TableroPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const [user, v] = await Promise.all([requireSessionUser(), getVacancy(id)]);
  if (!v) notFound();
  const term = param(sp, "buscar").slice(0, 80);
  const manager = user.role === "admin" || user.role === "coordinador";
  // La interfaz solo ofrece acciones permitidas; la base de datos valida cada una.
  const canMove = can(user.role, "postulaciones:editar") && (manager || v.recruiter_id === user.id);
  const canAdd = can(user.role, "postulaciones:crear") && (manager || v.recruiter_id === user.id) && (v.status === "abierta" || v.status === "pausada");
  const [board, results] = await Promise.all([
    getBoard(id, v.requisition?.client_id ?? null, v.position_id ?? null),
    canAdd && term ? searchCandidatesForVacancy(id, term) : Promise.resolve([]),
  ]);

  return (
    <>
      <Link href={`/vacantes/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a la vacante
      </Link>
      <PageHeader
        title={`Postulaciones: ${v.title}`}
        description={`${v.code} · ${v.requisition?.client?.name ?? ""} · ${board.applications.length} postulación(es)`}
        actions={manager && !board.preview ? <InlineAction action={syncStagesAction} fields={{ vacancy_id: id }} label="Actualizar etapas desde el proceso" variant="secondary" /> : null}
      />
      <Flash code={param(sp, "ok")} />
      <div className="mb-4 max-w-md">
        <CoverageBar openings={v.openings} filled={v.filled_count ?? 0} />
      </div>
      {board.error ? <Alert tone="error">{board.error}</Alert> : null}
      {board.preview ? (
        <Alert className="mb-4">Vista previa del proceso: las etapas se fijan para esta vacante al agregar la primera postulación.</Alert>
      ) : null}

      {canAdd ? (
        <Card className="mb-4">
          <CardHeader title="Agregar candidato" description="Solo candidatos activos y con consentimiento vigente." />
          <div className="px-5 py-4">
            <form method="get" className="flex gap-2" role="search" aria-label="Buscar candidato para postular">
              <label htmlFor="buscar" className="sr-only">
                Nombre del candidato
              </label>
              <input id="buscar" name="buscar" defaultValue={term} placeholder="Nombre o apellidos" maxLength={80} className="w-full max-w-sm rounded-md border border-neutral-300 px-3 py-2 text-sm" />
              <button type="submit" className={buttonClasses("dark")}>
                <Search className="h-4 w-4" aria-hidden /> Buscar
              </button>
            </form>
            {term ? (
              results.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-600">Sin candidatos disponibles con ese nombre.</p>
              ) : (
                <ul className="mt-3 divide-y divide-neutral-100" aria-label="Candidatos encontrados">
                  {results.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span>
                        <span className="font-semibold">
                          {c.first_name} {c.last_name}
                        </span>
                        {c.current_title ? <span className="text-neutral-500"> · {c.current_title}</span> : null}
                      </span>
                      <InlineAction action={createApplicationAction} fields={{ vacancy_id: id, candidate_id: c.id }} label="Agregar al proceso" variant="primary" />
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        </Card>
      ) : null}

      <KanbanBoard vacancyId={id} stages={board.stages} applications={board.applications} canMove={canMove && !board.preview} action={moveApplicationAction} />
    </>
  );
}
