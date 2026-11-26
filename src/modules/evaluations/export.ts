import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { isDemoMode } from "@/lib/env";
import { isUuid } from "@/lib/ids";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildReportDocx, buildTernaDocx } from "@/lib/report/docx";
import { buildReportPdf, buildTernaPdf } from "@/lib/report/pdf";
import { reportFileName } from "@/lib/report/model";
import { composeReport, composeTerna, type ReportInput } from "@/lib/report/compose";
import { normalizeProfile } from "@/lib/cv/profile";
import { INTERVIEW_KIND, RECOMMENDATION, WORK_MODALITY } from "@/modules/labels";
import type { AssessmentRequirement, AssessmentStatus, InterviewKind, Recommendation, ReportSection, WorkModality } from "@/types/database";

type Sb = Awaited<ReturnType<typeof createSupabaseServerClient>>;
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
    candidate_id: string;
    recruiter: { full_name: string } | null;
    candidate: { first_name: string; last_name: string; current_title: string | null; years_experience: number | null; english_level: string | null } | null;
    vacancy: {
      code: string;
      title: string;
      province: string | null;
      location_detail: string | null;
      modality: WorkModality | null;
      work_schedule: string | null;
      position: { name: string } | null;
      requisition: { client: { name: string } | null } | null;
    } | null;
  } | null;
};

const REPORT_SELECT =
  "id, status, version, content, recommendation, finalized_at, finalizer:profiles!executive_reports_finalized_by_fkey(full_name), " +
  "template:report_templates(name, version, header_text, footer_text, sections), " +
  "application:applications(id, vacancy_id, candidate_id, recruiter:profiles!applications_recruiter_id_fkey(full_name), " +
  "candidate:candidates(first_name, last_name, current_title, years_experience, english_level), " +
  "vacancy:vacancies(code, title, province, location_detail, modality, work_schedule, position:job_positions(name), requisition:requisitions(client:clients(name))))";

function deny(status: number, text: string) {
  return new NextResponse(text, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

function fileResponse(bytes: Uint8Array, formato: "docx" | "pdf", fileName: string) {
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

/** Reúne SOLO información registrada y validada: perfil confirmado, requisitos verificados, resultados y entrevistas realizadas. */
async function loadReportInput(sb: Sb, r: Row): Promise<ReportInput> {
  const app = r.application!;
  const [{ data: reqs }, { data: checks }, { data: vAssess }, { data: results }, { data: interviews }, { data: cv }, { data: summary }] = await Promise.all([
    sb.from("requirement_templates").select("id, requirement, requirement_type").eq("vacancy_id", app.vacancy_id),
    sb.from("application_requirement_checks").select("requirement_id, status, note, level:proficiency_levels(label)").eq("application_id", app.id),
    sb.from("vacancy_assessments").select("assessment_type_id, requirement, type:assessment_types(name, kind, max_score)").eq("vacancy_id", app.vacancy_id),
    sb.from("assessment_results").select("assessment_type_id, status, score, normalized, criteria_scores, notes, level:proficiency_levels(label)").eq("application_id", app.id),
    sb
      .from("interviews")
      .select("scheduled_at, kind, rating, recommendation, interviewer:profiles!interviews_interviewer_id_fkey(full_name), answers:interview_answers(competency, rating)")
      .eq("application_id", app.id)
      .eq("status", "realizada")
      .order("scheduled_at"),
    sb.from("candidate_cv_profiles").select("data").eq("candidate_id", app.candidate_id).eq("status", "confirmado").maybeSingle(),
    sb.rpc("application_assessment_summary", { p_application_id: app.id }),
  ]);
  type Chk = { requirement_id: string; status: string; note: string | null; level: { label: string } | null };
  type VA = { assessment_type_id: string; requirement: AssessmentRequirement; type: { name: string; kind: string | null; max_score: number | null } | null };
  type Res = { assessment_type_id: string; status: AssessmentStatus; score: number | null; normalized: number | null; criteria_scores: Array<{ name: string; score: number; weight: number }> | null; notes: string | null; level: { label: string } | null };
  type Int = { scheduled_at: string; kind: InterviewKind; rating: number | null; recommendation: Recommendation | null; interviewer: { full_name: string } | null; answers: Array<{ competency: string | null; rating: number | null }> };
  const checkBy = new Map(((checks ?? []) as unknown as Chk[]).map((c) => [c.requirement_id, c]));
  const resBy = new Map(((results ?? []) as unknown as Res[]).map((x) => [x.assessment_type_id, x]));
  const v = app.vacancy;
  return {
    header: r.template!.header_text ?? "The People Outsourcing Company S.A.",
    footer: r.template!.footer_text ?? "Documento confidencial.",
    templateVersion: r.template!.version,
    title: r.template!.name,
    reportVersion: r.version,
    finalizedAt: r.finalized_at ? DATE.format(new Date(r.finalized_at)) : "—",
    finalizedBy: r.finalizer?.full_name ?? null,
    candidate: {
      name: `${app.candidate?.first_name ?? ""} ${app.candidate?.last_name ?? ""}`.trim(),
      currentTitle: app.candidate?.current_title ?? null,
      years: app.candidate?.years_experience ?? null,
      english: app.candidate?.english_level ?? null,
    },
    vacancy: {
      code: v?.code ?? "",
      title: v?.title ?? "",
      position: v?.position?.name ?? null,
      client: v?.requisition?.client?.name ?? "—",
      location: [v?.province, v?.location_detail].filter(Boolean).join(", ") || null,
      modality: v?.modality ? WORK_MODALITY[v.modality] : null,
      schedule: v?.work_schedule ?? null,
    },
    recruiter: app.recruiter?.full_name ?? null,
    recommendation: r.recommendation,
    content: r.content ?? {},
    templateSections: r.template!.sections.map((s) => ({ key: s.key, title: s.title })),
    cv: cv?.data ? normalizeProfile(cv.data) : null,
    requirements: ((reqs ?? []) as Array<{ id: string; requirement: string; requirement_type: string }>)
      .filter((q) => checkBy.get(q.id)?.status !== "no_aplica")
      .map((q) => {
        const c = checkBy.get(q.id);
        return { name: q.requirement, type: q.requirement_type, status: (c?.status ?? "pendiente") as "pendiente" | "cumple" | "no_cumple", level: c?.level?.label ?? null, note: c?.note ?? null };
      }),
    assessments: ((vAssess ?? []) as unknown as VA[])
      .filter((q) => q.requirement !== "no_aplica" && q.type)
      .map((q) => {
        const x = resBy.get(q.assessment_type_id);
        return {
          name: q.type!.name,
          kind: q.type!.kind ?? "otra",
          requirement: q.requirement as "obligatoria" | "deseable",
          status: x?.status ?? "pendiente",
          normalized: x?.normalized != null ? Number(x.normalized) : null,
          detail: [x?.level ? `Nivel ${x.level.label}` : "", x?.score != null ? `${x.score}${q.type!.max_score ? ` de ${q.type!.max_score}` : ""}` : ""].filter(Boolean).join(" · "),
          criteria: (x?.criteria_scores ?? []).map((k) => ({ name: k.name, score: Number(k.score), weight: Number(k.weight ?? 1) })),
          notes: x?.notes ?? null,
        };
      }),
    weightedScore: (summary as { weighted_score: number | null } | null)?.weighted_score != null ? Number((summary as { weighted_score: number }).weighted_score) : null,
    interviews: ((interviews ?? []) as unknown as Int[]).map((i) => ({
      date: DATE.format(new Date(i.scheduled_at)),
      kind: INTERVIEW_KIND[i.kind],
      interviewer: i.interviewer?.full_name ?? "—",
      rating: i.rating,
      recommendation: i.recommendation ? RECOMMENDATION[i.recommendation].label : null,
      answers: i.answers ?? [],
    })),
  };
}

async function guardExport() {
  if (isDemoMode()) return { error: deny(404, "Modo demostración: no hay informes.") } as const;
  const user = await getSessionUser();
  if (!user) return { error: deny(401, "Inicie sesión.") } as const;
  if (!can(user.role, "postulaciones:editar")) return { error: deny(403, "No tiene permiso para exportar informes.") } as const;
  return { sb: await createSupabaseServerClient(), user } as const;
}

/**
 * Exporta un informe ejecutivo FINAL. La base de datos autoriza y registra la
 * exportación (log_report_export) antes de generar el archivo.
 */
export async function exportReport(id: string, formato: string) {
  if (!isUuid(id) || (formato !== "docx" && formato !== "pdf")) return deny(404, "No encontrado.");
  const g = await guardExport();
  if ("error" in g) return g.error;
  const { data, error } = await g.sb.from("executive_reports").select(REPORT_SELECT).eq("id", id).maybeSingle();
  const r = data as unknown as Row | null;
  if (error || !r || !r.application || !r.template) return deny(404, "No encontrado.");
  if (r.status !== "final") return deny(409, "Solo se exporta el informe final.");
  const logged = await g.sb.rpc("log_report_export", { p_report_id: id, p_format: formato });
  if (logged.error) return deny(403, "No tiene permiso para exportar este informe.");
  const model = composeReport(await loadReportInput(g.sb, r));
  const bytes = formato === "pdf" ? await buildReportPdf(model) : buildReportDocx(model);
  return fileResponse(bytes, formato, reportFileName(model.candidateName, r.version, formato));
}

/** Informe comparativo de terna: 2 a 6 informes FINALES de la misma vacante; la BD autoriza y registra antes de generar. */
export async function exportTerna(vacancyId: string, formato: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!isUuid(vacancyId) || (formato !== "docx" && formato !== "pdf") || !unique.every(isUuid)) return deny(404, "No encontrado.");
  if (unique.length < 2 || unique.length > 6) return deny(400, "Seleccione de 2 a 6 candidatos con informe final.");
  const g = await guardExport();
  if ("error" in g) return g.error;
  const { data, error } = await g.sb.from("executive_reports").select(REPORT_SELECT).in("application_id", unique);
  const rows = (data ?? []) as unknown as Row[];
  if (error || rows.length !== unique.length || rows.some((r) => !r.application || !r.template || r.application.vacancy_id !== vacancyId)) return deny(404, "No encontrado.");
  if (rows.some((r) => r.status !== "final")) return deny(409, "Todos los candidatos deben tener el informe final.");
  const logged = await g.sb.rpc("log_terna_export", { p_vacancy_id: vacancyId, p_application_ids: unique, p_format: formato });
  if (logged.error) return deny(403, "No tiene permiso para exportar esta terna.");
  const ordered = unique.map((id) => rows.find((r) => r.application!.id === id)!);
  const inputs = await Promise.all(ordered.map((r) => loadReportInput(g.sb, r)));
  const first = inputs[0]!;
  const model = composeTerna(
    {
      header: first.header,
      footer: first.footer,
      title: "Informe comparativo de terna",
      vacancy: `${first.vacancy.title} (${first.vacancy.code})`,
      client: first.vacancy.client,
      position: first.vacancy.position,
      date: DATE.format(new Date()),
      preparedBy: g.user.fullName ?? null,
    },
    inputs.map((input) => ({ input })),
  );
  const bytes = formato === "pdf" ? await buildTernaPdf(model) : buildTernaDocx(model);
  return fileResponse(bytes, formato, reportFileName(first.vacancy.code || "vacante", 1, formato, "Terna"));
}
