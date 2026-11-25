import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Forbidden } from "@/components/ui/forbidden";
import { InlineAction } from "@/modules/common/inline-action";
import { listClientOptions } from "@/modules/common/options";
import { listJobPositions, listScales } from "@/modules/catalogs/repository";
import { listAssessmentTypes, listCredentialTypes, listQuestionBank, listTemplates } from "@/modules/evaluations/repository";
import {
  createAssessmentTypeAction,
  createCredentialTypeAction,
  createQuestionAction,
  createTemplateVersionAction,
  toggleEvaluationCatalogAction,
} from "@/modules/evaluations/actions";
import { AssessmentTypeForm, CredentialTypeForm, QuestionBankForm, TemplateForm } from "@/modules/evaluations/forms";
import { QUESTION_CATEGORY } from "@/modules/labels";
import { pagePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Entrevistas y evaluaciones" };

function Toggle({ table, id, active }: { table: string; id: string; active: boolean; label?: string }) {
  return <InlineAction action={toggleEvaluationCatalogAction} fields={{ table, id, active: String(!active) }} label={active ? "Desactivar" : "Activar"} variant="ghost" />;
}

export default async function EvaluacionesAdminPage() {
  const { user, allowed } = await pagePermission("configuracion:gestionar");
  if (!allowed) return <Forbidden />;
  const [questions, aTypes, cTypes, templates, positions, clients, scales] = await Promise.all([
    listQuestionBank(),
    listAssessmentTypes(),
    listCredentialTypes(),
    listTemplates(),
    listJobPositions(),
    listClientOptions(),
    listScales(),
  ]);
  const active = templates.data.find((t) => t.is_active) ?? null;
  const scaleName = new Map(scales.data.map((s) => [s.id, s.name]));
  return (
    <>
      <PageHeader title="Entrevistas y evaluaciones" description="Catálogos de la fase 4. No se borran: se desactivan para conservar el historial." />

      <Card className="mb-6">
        <CardHeader title="Banco de preguntas de entrevista" description="Generales, por puesto o por cliente. El guion de cada entrevista se arma con las activas que apliquen." />
        <ul className="divide-y divide-neutral-100" aria-label="Banco de preguntas">
          {questions.data.map((q) => (
            <li key={q.id} className={`flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm ${q.is_active ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{q.text}</p>
                <p className="text-xs text-neutral-500">
                  {QUESTION_CATEGORY[q.category]} · {q.position?.name ?? "Todos los puestos"} · {q.client?.name ?? "Todos los clientes"}
                  {q.guidance ? ` · Observar: ${q.guidance}` : ""}
                </p>
              </div>
              <Toggle table="interview_questions" id={q.id} active={q.is_active} label={`pregunta ${q.text}`} />
            </li>
          ))}
        </ul>
        <div className="border-t border-neutral-100 px-5 py-4">
          <QuestionBankForm
            action={createQuestionAction}
            positions={positions.data.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name }))}
            clients={clients.data.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
      </Card>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Tipos de evaluación" description="Pruebas de Excel, inglés, SAP, de campo y otras." />
          <ul className="divide-y divide-neutral-100" aria-label="Tipos de evaluación">
            {aTypes.data.map((t) => (
              <li key={t.id} className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm ${t.is_active ? "" : "opacity-60"}`}>
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-neutral-500">
                    {t.scale_id ? `Nivel: ${scaleName.get(t.scale_id) ?? "escala"}` : "Sin nivel"}
                    {t.max_score != null ? ` · Puntaje hasta ${t.max_score}` : ""}
                    {t.pass_score != null ? ` · aprueba con ${t.pass_score}` : ""}
                  </p>
                </div>
                <Toggle table="assessment_types" id={t.id} active={t.is_active} label={`evaluación ${t.name}`} />
              </li>
            ))}
          </ul>
          <div className="border-t border-neutral-100 px-5 py-4">
            <AssessmentTypeForm action={createAssessmentTypeAction} scales={scales.data} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Tipos de credencial" description="Licencias, carnés y certificaciones con control de vigencia." />
          <ul className="divide-y divide-neutral-100" aria-label="Tipos de credencial">
            {cTypes.data.map((t) => (
              <li key={t.id} className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm ${t.is_active ? "" : "opacity-60"}`}>
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-neutral-500">{t.requires_expiry ? `Con vencimiento · alerta ${t.alert_days} día(s) antes` : "Sin vencimiento"}</p>
                </div>
                <Toggle table="credential_types" id={t.id} active={t.is_active} label={`credencial ${t.name}`} />
              </li>
            ))}
          </ul>
          <div className="border-t border-neutral-100 px-5 py-4">
            <CredentialTypeForm action={createCredentialTypeAction} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Plantilla del informe ejecutivo" description={active ? `Vigente: ${active.name} · versión ${active.version}` : "Sin plantilla vigente"} />
        <div className="space-y-4 px-5 py-5">
          {active?.version.includes("PROVISIONAL") ? (
            <Alert>
              Plantilla <strong>provisional</strong>. Cuando TPC entregue el machote oficial, publique una versión nueva con sus secciones y textos.
            </Alert>
          ) : null}
          <ul className="space-y-1 text-sm" aria-label="Versiones de la plantilla">
            {templates.data.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                {t.version} · {t.name} · {formatDate(t.created_at)} {t.is_active ? <Badge def={{ label: "Vigente", tone: "success" }} /> : null}
              </li>
            ))}
          </ul>
          {can(user.role, "plantillas:gestionar") ? (
            <TemplateForm action={createTemplateVersionAction} current={active} />
          ) : (
            <p className="text-sm text-neutral-500">Solo administración publica versiones de la plantilla.</p>
          )}
        </div>
      </Card>
    </>
  );
}
