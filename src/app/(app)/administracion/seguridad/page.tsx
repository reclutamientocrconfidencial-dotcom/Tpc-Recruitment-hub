import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { DataTable } from "@/components/ui/data-table";
import { pagePermission } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { isDemoMode } from "@/lib/env";
import { getMfaStatus, listUsersSecurity } from "@/modules/security/repository";
import { setMfaRequiredAction } from "@/modules/security/actions";
import { MfaRequiredForm } from "@/modules/security/mfa-required-form";
import { IDLE_TIMEOUT_MINUTES } from "@/modules/security/schema";
import type { AppRole } from "@/types/database";

export const metadata: Metadata = { title: "Seguridad" };

export default async function SeguridadAdminPage() {
  const { allowed } = await pagePermission("usuarios:gestionar");
  if (!allowed) return <Forbidden message="Solo administradores pueden gestionar la seguridad." />;
  const [mfa, users] = await Promise.all([getMfaStatus(), listUsersSecurity()]);
  const activeUsers = users.data.filter((u) => u.is_active);
  const missing = activeUsers.filter((u) => !u.mfa_enabled).length;

  return (
    <>
      <PageHeader title="Seguridad" description="Puerta S1: controles previos a la carga de datos personales reales." />
      {isDemoMode() ? <Alert className="mb-4">Modo demostración: esta configuración solo está disponible con Supabase.</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Verificación en dos pasos (MFA)"
            description="Cuando es obligatoria, la base de datos no entrega información a ninguna sesión sin código (nivel aal2)."
            action={
              mfa.required ? (
                <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Obligatoria</span>
              ) : (
                <span className="rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">Opcional</span>
              )
            }
          />
          <div className="space-y-4 px-5 py-5 text-sm">
            <p>
              <span className="font-semibold">{activeUsers.length - missing}</span> de <span className="font-semibold">{activeUsers.length}</span> usuarios activos la
              tienen configurada.
            </p>
            {mfa.level !== "aal2" ? (
              <Alert>
                Para cambiar esta opción, primero <Link className="font-semibold underline" href="/cuenta/seguridad">active su propia verificación</Link> y vuelva a
                iniciar sesión con su código.
              </Alert>
            ) : null}
            <MfaRequiredForm action={setMfaRequiredAction} required={mfa.required} missing={missing} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Otros controles" />
          <ul className="list-disc space-y-2 px-9 py-5 text-sm text-neutral-700">
            <li>Cierre de sesión tras {IDLE_TIMEOUT_MINUTES} minutos de inactividad.</li>
            <li>Bitácora de cambios y registro de accesos inalterables.</li>
            <li>Respaldo cifrado diario con prueba de restauración (ver manual de administración).</li>
          </ul>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold text-ink-950">Usuarios</h2>
      <DataTable
        caption="Estado de la verificación en dos pasos por usuario"
        rows={users.data}
        error={users.error}
        emptyTitle="Sin usuarios"
        columns={[
          { header: "Usuario", cell: (u) => <span className="font-semibold">{u.full_name || u.email}</span> },
          { header: "Correo", cell: (u) => u.email },
          { header: "Rol", cell: (u) => ROLE_LABELS[u.role as AppRole] ?? u.role },
          { header: "Estado", cell: (u) => (u.is_active ? "Activo" : "Inactivo") },
          {
            header: "Verificación en dos pasos",
            cell: (u) =>
              u.mfa_enabled ? <span className="font-semibold text-emerald-700">Configurada</span> : <span className="font-semibold text-brand-700">Pendiente</span>,
          },
        ]}
      />
    </>
  );
}
