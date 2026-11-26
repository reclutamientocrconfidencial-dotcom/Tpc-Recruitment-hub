import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Forbidden } from "@/components/ui/forbidden";
import { getAiSettings, getAiUsage } from "@/modules/ai/repository";
import { saveAiSettingsAction } from "@/modules/ai/actions";
import { AiSettingsForm } from "@/modules/ai/settings-form";
import { AI_FEATURE_LABEL, type AiFeature } from "@/lib/ai/features";
import { ALLOWED_MODELS } from "@/lib/ai/pricing";
import { pagePermission } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Inteligencia artificial" };

const USD = new Intl.NumberFormat("es-CR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });

export default async function IaAdminPage() {
  const { allowed } = await pagePermission("usuarios:gestionar");
  if (!allowed) return <Forbidden message="Solo administración configura la inteligencia artificial." />;
  const [settings, usage] = await Promise.all([getAiSettings(), getAiUsage()]);
  return (
    <>
      <PageHeader title="Inteligencia artificial" description="Asistente modular con revisión humana obligatoria, datos mínimos y seudonimizados, y control de costos." />
      <Alert className="mb-6">
        Un proveedor externo exige autorización de costos y un acuerdo de tratamiento de datos. Hasta entonces use el proveedor <strong>simulado</strong>, que no envía
        información fuera del sistema.
      </Alert>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Configuración" />
          <div className="px-5 py-5">{settings ? <AiSettingsForm action={saveAiSettingsAction} settings={settings} models={ALLOWED_MODELS} /> : <p className="text-sm text-neutral-500">Disponible con base de datos.</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Consumo del mes" description="Hora de Costa Rica. El costo del proveedor simulado es cero." />
          {usage ? (
            <div className="space-y-4 px-5 py-5 text-sm">
              <p className="text-2xl font-bold" data-testid="ai-month-cost">
                {USD.format(Number(usage.month_cost))} <span className="text-sm font-normal text-neutral-500">de {USD.format(Number(usage.budget))}</span>
              </p>
              <p>
                {usage.requests} consulta(s) · {usage.accepted} aceptada(s) · {usage.discarded} descartada(s) · {usage.errors} con error
              </p>
              <div>
                <p className="font-semibold">Por función</p>
                <ul className="list-disc pl-5">
                  {Object.entries(usage.by_feature).map(([k, n]) => (
                    <li key={k}>
                      {AI_FEATURE_LABEL[k as AiFeature] ?? k}: {n}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-semibold">Por usuario</p>
                <ul className="list-disc pl-5">
                  {usage.by_user.map((u) => (
                    <li key={u.name}>
                      {u.name}: {u.requests} consulta(s) · {USD.format(Number(u.cost))}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="px-5 py-5 text-sm text-neutral-500">Sin datos.</p>
          )}
        </Card>
      </div>
    </>
  );
}
