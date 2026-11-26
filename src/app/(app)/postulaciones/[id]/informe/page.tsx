import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Forbidden } from "@/components/ui/forbidden";
import { buttonClasses } from "@/components/ui/button";
import { getApplication } from "@/modules/applications/repository";
import { getReport } from "@/modules/evaluations/repository";
import { saveReportAction } from "@/modules/evaluations/actions";
import { ReportEditor } from "@/modules/evaluations/forms";
import { pagePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "Informe ejecutivo" };

export default async function InformePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { user, allowed } = await pagePermission("postulaciones:editar");
  if (!allowed) return <Forbidden />;
  const [a, report] = await Promise.all([getApplication(id), getReport(id)]);
  if (!a || !report || !report.template) notFound();
  const name = `${a.candidate?.first_name ?? ""} ${a.candidate?.last_name ?? ""}`.trim();
  const final = report.status === "final";
  return (
    <>
      <PageHeader
        title={`Informe ejecutivo: ${name}`}
        description={`${a.vacancy?.code ?? ""} · ${a.vacancy?.title ?? ""} · ${a.vacancy?.requisition?.client?.name ?? ""} · Plantilla ${report.template.version}`}
        actions={
          <>
            <Badge def={final ? { label: `Final · versión ${report.version}`, tone: "success" } : { label: `Borrador · versión ${report.version}`, tone: "warning" }} />
            <Link href={`/postulaciones/${id}`} className={buttonClasses("secondary")}>
              Volver a la postulación
            </Link>
          </>
        }
      />
      {final ? (
        <Card className="mb-6 flex flex-wrap items-center gap-3 p-5">
          <p className="text-sm">
            Finalizado {report.finalized_at ? formatDateTime(report.finalized_at) : ""} {report.finalizer?.full_name ? `por ${report.finalizer.full_name}` : ""}. Cada exportación queda registrada.
          </p>
          <a href={`/api/informes/${report.id}/docx`} className={buttonClasses("dark")}>
            <Download className="h-4 w-4" aria-hidden /> Word (.docx)
          </a>
          <a href={`/api/informes/${report.id}/pdf`} className={buttonClasses("dark")}>
            <Download className="h-4 w-4" aria-hidden /> PDF
          </a>
        </Card>
      ) : (
        <Alert className="mb-6">
          Borrador: redacte los apartados de texto. El documento exportado agrega automáticamente, solo con información registrada y validada: información
          general, formación y trayectoria (del perfil curricular confirmado), matriz de cumplimiento, evaluación de competencias, resultados de pruebas y
          casos prácticos. Los apartados sin información se omiten.
        </Alert>
      )}
      <Card className="p-5">
        <ReportEditor action={saveReportAction} report={report} sections={report.template.sections} canReopen={can(user.role, "configuracion:gestionar")} />
      </Card>
    </>
  );
}
