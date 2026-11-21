import type { Permission } from "@/lib/auth/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: "dashboard" | "clients" | "requisitions" | "vacancies" | "candidates" | "applications";
  permission: Permission;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", permission: "dashboard:ver" },
  { href: "/clientes", label: "Clientes", icon: "clients", permission: "clientes:ver" },
  { href: "/requisiciones", label: "Requisiciones", icon: "requisitions", permission: "requisiciones:ver" },
  { href: "/vacantes", label: "Vacantes", icon: "vacancies", permission: "vacantes:ver" },
  { href: "/candidatos", label: "Candidatos", icon: "candidates", permission: "candidatos:ver" },
  { href: "/postulaciones", label: "Postulaciones", icon: "applications", permission: "postulaciones:ver" },
];
