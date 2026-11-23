import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Inbox, UserCog, Workflow, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { requireSessionUser } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Administración" };

const SECTIONS: Array<{ href: string; title: string; text: string; icon: LucideIcon; permission: Permission }> = [
  { href: "/administracion/usuarios", title: "Usuarios y roles", text: "Asignar roles y activar o desactivar cuentas.", icon: UserCog, permission: "usuarios:gestionar" },
  { href: "/administracion/procesos", title: "Proceso estándar y requisitos", text: "Etapas y requisitos globales de TPC.", icon: Workflow, permission: "configuracion:gestionar" },
  { href: "/administracion/catalogos", title: "Catálogos", text: "Etapas, puestos, requisitos y niveles de dominio.", icon: BookOpen, permission: "configuracion:gestionar" },
  { href: "/administracion/fuentes", title: "Fuentes de recepción", text: "Canales por los que llegan los candidatos.", icon: Inbox, permission: "configuracion:gestionar" },
];

export default async function AdministracionPage() {
  const user = await requireSessionUser();
  const sections = SECTIONS.filter((s) => can(user.role, s.permission));
  if (sections.length === 0) return <Forbidden />;
  return (
    <>
      <PageHeader title="Administración" description="Configuración del sistema." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sections.map(({ href, title, text, icon: Icon }) => (
          <Link key={href} href={href} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="mb-3 inline-flex rounded-lg bg-brand-50 p-2 text-brand-600"><Icon className="h-5 w-5" aria-hidden /></div>
            <h2 className="font-semibold text-ink-950">{title}</h2>
            <p className="mt-1 text-sm text-neutral-500">{text}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
