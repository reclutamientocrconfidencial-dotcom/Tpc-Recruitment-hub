import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { isDemoMode } from "@/lib/env";
import { isUuid } from "@/lib/ids";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildReportDocx } from "@/lib/report/docx";
import { buildReportPdf } from "@/lib/report/pdf";
import { reportFileName, type ReportModel } from "@/lib/report/model";
import { ASSESSMENT_REQUIREMENT, ASSESSMENT_STATUS, INTERVIEW_KIND, RECOMMENDATION } from "@/modules/labels";
import type { AssessmentRequirement, AssessmentStatus, InterviewKind, Recommendation, ReportSection } from "@/types/database";

const DATE = new Intl.DateTimeFormat("es-CR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Costa_Rica" });

type Row = {
  id: string;
  status: string;
  version: number;
  content: Record<string, string>;
  recommendation: Recommendation | null;
  finalized_at: string | null;
  finalizer: { full_name: string } | null;
  template: { name: string; version: string; header_text: string | null; footer_text: string | null; sections: ReportSection[] } | null;
  application: {
    id: string;
    vacancy_id: string;
    candidate: { first_name: string; last_name: string } | null;
    vacancy: { code: string; title: string; position: { name: string } | null; requisition: { client: { name: string } | null } | null } | null;
  } | null;
};

/**
 * Exporta un informe ejecutivo FINAL. La base de datos autoriza y registra la
 * exportación (log_report_export) antes de generar el archivo.
 */
export async function exportReport(id: string, formato: string) {
  const deny = (status: number, text: string) => new NextResponse(text, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  if (!isUuid(id) || (formato !== "docx" && formato !== "pdf")) return deny(404, "No encontrado.");
  if (isDemoMode()) return deny(404, "Modo demostración: no hay informes.");
  const user = await getSessionUser();
  if (!user) return deny(401, "Inicie sesión.");
  if (!can(user.role, "postulaciones:editar")) return deny(403, "No tiene permiso para exportar informes.");
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .from("executive_reports")
    .select(
      "id, status, version, content, recommendation, finalized_at, finalizer:profiles!executive_reports_finalized_by_fkey(full_name), " +
        "template:report_templates(name, version, header_text, footer_text, sections), " +
        "application:applications(id, vacancy_id, candidate:candidates(first_name, last_name), vacancy:vacancies(code, title, position:job_positions(name), requisition:requisitions(client:clients(name))))",
    )
    .eq("id", id)
    .maybeSingle();
  const r = data as unknown as Row | null;
  if (error || !r || !r.application || !r.template) return deny(404, "No encontrado.");
  if (r.status !== "final") return deny(409, "Solo se exporta el informe final.");
  const logged = await sb.rpc("log_report_export", { p_report_id: id, p_format: formato });
  if (logged.error) return deny(403, "No tiene permiso para exportar este informe.");

  const [{ data: required }, { data: results }, { data: interviews }] = await Promise.all([
    sb.from("vacancy_assessments").select("assessment_type_id, requirement, type:assessment_types(name)").eq("vacancy_id", r.application.vacancy_id),
    sb.from("assessment_results").select("assessment_type_id, status, score, type:assessment_types(name, max_score), level:proficiency_levels(label)").eq("application_id", r.application.id),
    sb.from("interviews").select("scheduled_at, kind, recommendation, interviewer:profiles!interviews_interviewer_id_fkey(full_name)").eq("application_id", r.application.id).eq("status", "realizada").order("scheduled_at"),
  ]);
  type Req = { assessment_type_id: string; requirement: AssessmentRequirement; type: { name: string } | null };
  type Res = { assessment_type_id: string; status: AssessmentStatus; score: number | null; type: { name: string; max_score: number | null } | null; level: { label: string } | null };
  type Int = { scheduled_at: string; kind: InterviewKind; recommendation: Recommendation | null; interviewer: { full_name: string } | null };
  const reqBy = new Map(((required ?? []) as unknown as Req[]).map((q) => [q.assessment_type_id, q]));
  const resBy = new Map(((results ?? []) as unknown as Res[]).map((x) => [x.assessment_type_id, x]));
  const typeIds = [...new Set([...reqBy.keys(), ...resBy.keys()])].filter((t) => reqBy.get(t)?.requirement !== "no_aplica" || resBy.has(t));
  const name = `${r.application.candidate?.first_name ?? ""} ${r.application.candidate?.last_name ?? ""}`.trim();

  const model: ReportModel = {
    header: r.template.header_text ?? "The People Outsourcing Company S.A.",
    footer: r.template.footer_text ?? "Documento confidencial.",
    templateVersion: r.template.version,
    title: r.template.name,
    candidateName: name,
    vacancy: `${r.application.vacancy?.code ?? ""} · ${r.application.vacancy?.title ?? ""}`,
    client: r.application.vacancy?.requisition?.client?.name ?? "—",
    position: r.application.vacancy?.position?.name ?? null,
    reportVersion: r.version,
    finalizedAt: r.finalized_at ? DATE.format(new Date(r.finalized_at)) : "—",
    finalizedBy: r.finalizer?.full_name ?? null,
    recommendation: r.recommendation ? RECOMMENDATION[r.recommendation].label : "—",
    assessments: typeIds.map((t) => {
      const q = reqBy.get(t);
      const x = resBy.get(t);
      return {
        name: x?.type?.name ?? q?.type?.name ?? "Evaluación",
        requirement: q ? ASSESSMENT_REQUIREMENT[q.requirement].label : "Adicional",
        result: ASSESSMENT_STATUS[x?.status ?? "pendiente"].label,
        detail: [x?.level ? `Nivel ${x.level.label}` : "", x?.score != null ? `${x.score}${x.type?.max_score ? ` de ${x.type.max_score}` : ""}` : ""].filter(Boolean).join(" · ") || "—",
      };
    }),
    interviews: ((interviews ?? []) as unknown as Int[]).map((i) => ({
      date: DATE.format(new Date(i.scheduled_at)),
      kind: INTERVIEW_KIND[i.kind],
      interviewer: i.interviewer?.full_name ?? "—",
      recommendation: i.recommendation ? RECOMMENDATION[i.recommendation].label : "—",
    })),
    sections: r.template.sections.map((s) => ({ title: s.title, body: r.content[s.key] ?? "" })),
  };
  const bytes = formato === "pdf" ? await buildReportPdf(model) : buildReportDocx(model);
  const fileName = reportFileName(name, r.version, formato);
  return new NextResponse(new Blob([bytes as BlobPart]), {
    status: 200,
    headers: {
      "Content-Type": formato === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
