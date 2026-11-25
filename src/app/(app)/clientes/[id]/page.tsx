import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { buttonClasses } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { getClient, listClientOpenVacancies, listClientRequisitions } from "@/modules/clients/repository";
import { setClientStatusAction } from "@/modules/clients/actions";
import { CLIENT_STATUS, REQUISITION_STATUS, VACANCY_STATUS } from "@/modules/labels";
import { requireSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { param, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Cliente" };

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-950">{value || "—"}</dd>
    </div>
  );
}

export default async function ClienteDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const [user, client, requisitions, vacancies] = await Promise.all([
    requireSessionUser(),
    getClient(id),
    listClientRequisitions(id),
    listClientOpenVacancies(id),
  ]);
  if (!client) notFound();
  const canEdit = can(user.role, "clientes:editar");

  return (
    <>
      <PageHeader
        title={client.name}
        description={client.industry ?? "Cliente"}
        actions={
          <>
            <Link href={`/clientes/${id}/configuracion`} className={buttonClasses("secondary")}>
              <Settings2 className="h-4 w-4" aria-hidden /> Configuración
            </Link>
            {canEdit ? (
              <Link href={`/clientes/${id}/editar`} className={buttonClasses("primary")}>
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </Link>
            ) : null}
          </>
        }
      />
      <Flash code={param(sp, "ok")} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Datos del cliente" action={<Badge def={CLIENT_STATUS[client.status]} />} />
          <dl className="grid gap-5 px-5 py-5 sm:grid-cols-2">
            <Item label="Cédula jurídica" value={client.legal_id} />
            <Item label="Industria" value={client.industry} />
            <Item label="Provincia" value={client.province} />
            <Item label="Dirección" value={client.address} />
            <Item label="Gestor de cuenta" value={client.account_manager?.full_name} />
            <Item label="Registrado" value={formatDate(client.created_at)} />
            <div className="sm:col-span-2">
              <Item label="Observaciones" value={client.notes ? <span className="whitespace-pre-line">{client.notes}</span> : null} />
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Contacto" />
          <dl className="grid gap-5 px-5 py-5">
            <Item label="Nombre" value={client.contact_name} />
            <Item label="Correo" value={client.contact_email ? <a className="text-brand-600 hover:underline" href={`mailto:${client.contact_email}`}>{client.contact_email}</a> : null} />
            <Item label="Teléfono" value={client.contact_phone} />
          </dl>
          {canEdit ? (
            <form action={setClientStatusAction} className="border-t border-neutral-100 px-5 py-4">
              <input type="hidden" name="id" value={client.id} />
              <input type="hidden" name="status" value={client.status === "inactivo" ? "activo" : "inactivo"} />
              <SubmitButton variant={client.status === "inactivo" ? "dark" : "secondary"} className="w-full" pendingText="Actualizando…">
                {client.status === "inactivo" ? "Reactivar cliente" : "Desactivar cliente"}
              </SubmitButton>
              <p className="mt-2 text-xs text-neutral-500">Los clientes no se eliminan: se desactivan para conservar el historial.</p>
            </form>
          ) : null}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Requisiciones" description="Últimas 20 visibles para su usuario" />
          {requisitions.data.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-neutral-500">Sin requisiciones.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {requisitions.data.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{r.title}</p>
                    <p className="font-mono text-xs text-neutral-500">{r.code}</p>
                  </div>
                  <Badge def={REQUISITION_STATUS[r.status]} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Vacantes abiertas" />
          {vacancies.data.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-neutral-500">Sin vacantes abiertas.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {vacancies.data.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{v.title}</p>
                    <p className="font-mono text-xs text-neutral-500">{v.code}</p>
                  </div>
                  <Badge def={VACANCY_STATUS[v.status]} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
