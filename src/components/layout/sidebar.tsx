"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Building2, ClipboardList, Inbox, LayoutDashboard, Settings, Users, Workflow, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/layout/logo";
import type { NavItem } from "@/components/layout/nav";

const ICONS: Record<NavItem["icon"], LucideIcon> = {
  dashboard: LayoutDashboard,
  clients: Building2,
  requisitions: ClipboardList,
  vacancies: Briefcase,
  candidates: Users,
  applications: Workflow,
  inbox: Inbox,
  admin: Settings,
};

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-ink-950 text-neutral-300 lg:flex">
      <div className="border-b border-white/10 px-5 py-5">
        <Logo inverted />
      </div>
      <nav aria-label="Navegación principal" className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-brand-600 text-white shadow" : "hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-5 py-4 text-[11px] text-neutral-500">
        Fase 2 · Costa Rica
        <span className="block font-mono" data-testid="version">Versión {process.env.NEXT_PUBLIC_BUILD_ID ?? "local"}</span>
      </div>
    </aside>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegación móvil" className="flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-4 py-2 lg:hidden">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium",
              active ? "bg-brand-600 text-white" : "text-neutral-600 hover:bg-neutral-100",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
