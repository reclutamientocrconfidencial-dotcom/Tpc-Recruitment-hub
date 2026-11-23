import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Briefcase, ListChecks, Milestone, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { pagePermission } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Catálogos" };

const ITEMS: Array<{ href: string; title: string; text: string; icon: LucideIcon }> = [
  { href: "/administracion/catalogos/etapas", title: "Etapas de reclutamiento", text: "Etapas disponibles para armar procesos, con su categoría y tipo.", icon: Milestone },
  { href: "/administracion/catalogos/puestos", title: "Puestos", text: "Catálogo abierto de puestos y perfiles profesionales.", icon: Briefcase },
  { href: "/administracion/catalogos/requisitos", title: "Requisitos", text: "Requisitos reutilizables y su escala de dominio.", icon: ListChecks },
  { href: "/administracion/catalogos/niveles", title: "Niveles de dominio", text: "Escalas configurables (idiomas, herramientas, experiencia…).", icon: BarChart3 },
];

export default async function CatalogosPage() {
  const { allowed } = await pagePermission("configuracion:gestionar");
  if (!allowed) return <Forbidden />;
  return (
    <>
      <PageHeader title="Catálogos" description="Los elementos no se borran: se desactivan para conservar el historial." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ITEMS.map(({ href, title, text, icon: Icon }) => (
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
