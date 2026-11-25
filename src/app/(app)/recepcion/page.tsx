import type { Metadata } from "next";
import Link from "next/link";
import { FileText, QrCode } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { FilterBar } from "@/components/ui/filter-bar";
import { Field, SelectInput } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { Forbidden } from "@/components/ui/forbidden";
import { buttonClasses } from "@/components/ui/button";
import { listForms, searchSubmissions } from "@/modules/intake/repository";
import { parseSubmissionFilters, submissionFilterParams } from "@/modules/intake/filters";
import { SUBMISSION_STATUS, optionsFrom } from "@/modules/labels";
import { pagePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Recepción" };

export default async function RecepcionPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { user, allowed } = await pagePermission("recepcion:ver");
  if (!allowed) return <Forbidden message="La bandeja de recepción contiene datos personales y no está disponible para su rol." />;
  const sp = await searchParams;
  const filters = parseSubmissionFilters(sp);
  const [result, forms] = await Promise.all([searchSubmissions(filters), listForms()]);
  return (
    <>
      <PageHeader
        title="Recepción de candidatos"
        description="Postulaciones recibidas por formularios públicos. Sin coincidencias se incorporan solas; con posibles duplicados esperan su revisión."
        actions={
          can(user.role, "formularios:gestionar") ? (
            <Link href="/recepcion/formularios" className={buttonClasses("dark")}>
              <QrCode className="h-4 w-4" aria-hidden /> Formularios, enlaces y QR
            </Link>
          ) : null
        }
      />
      <FilterBar path="/recepcion" active={filters.status !== "revision" || Boolean(filters.formId)}>
        <Field id="estado" label="Estado">
          <SelectInput id="estado" defaultValue={filters.status || "todos"} options={[...optionsFrom(SUBMISSION_STATUS), { value: "todos", label: "Todos" }]} />
        </Field>
        <Field id="formulario" label="Formulario">
          <SelectInput id="formulario" defaultValue={filters.formId} placeholder="Todos" options={forms.data.map((f) => ({ value: f.id, label: f.title }))} />
        </Field>
      </FilterBar>
      <DataTable
        caption="Envíos recibidos"
        rows={result.rows}
        error={result.error}
        emptyTitle={filters.status === "revision" ? "Nada pendiente de revisión" : "Sin envíos"}
        emptyDescription="Los envíos de los formularios públicos aparecen aquí."
        columns={[
          {
            header: "Persona",
            cell: (s) => (
              <Link href={`/recepcion/${s.id}`} className="font-semibold text-ink-950 hover:text-brand-600 hover:underline">
                {s.full_name}
              </Link>
            ),
          },
          { header: "Recibido", cell: (s) => formatDateTime(s.created_at) },
          { header: "Formulario / vacante", cell: (s) => (s.vacancy ? `${s.vacancy.code} · ${s.vacancy.title}` : (s.form?.title ?? "—")) },
          { header: "Canal", cell: (s) => [s.channel?.name, s.link?.label].filter(Boolean).join(" · ") || "—" },
          {
            header: "Preselección",
            cell: (s) => (s.preselection_ok == null ? "—" : s.preselection_ok ? <Badge def={{ label: "Cumple", tone: "success" }} /> : <Badge def={{ label: "No cumple", tone: "warning" }} />),
          },
          { header: "CV", cell: (s) => (s.cv_path ? <FileText className="h-4 w-4 text-neutral-600" aria-label="Con currículum" /> : "—"), className: "text-center" },
          {
            header: "Estado",
            cell: (s) => (
              <span className="inline-flex flex-wrap items-center gap-1">
                <Badge def={SUBMISSION_STATUS[s.status]} />
                {s.status === "revision" && s.match_reasons.length ? <span className="text-xs text-neutral-500">coincide: {s.match_reasons.join(", ")}</span> : null}
              </span>
            ),
          },
        ]}
      />
      {!result.error && result.total > 0 ? (
        <Pagination path="/recepcion" params={submissionFilterParams(filters)} page={result.page} total={result.total} pageSize={result.pageSize} />
      ) : null}
    </>
  );
}
