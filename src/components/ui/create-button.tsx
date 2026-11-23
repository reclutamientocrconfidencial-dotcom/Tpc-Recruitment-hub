import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";

/**
 * Botón de alta. Solo se muestra si el rol tiene permiso (la base de datos
 * vuelve a validar). Sin `href`, el módulo aún no tiene formulario (fases 2B/2C).
 */
export function CreateButton({ label, allowed, href }: { label: string; allowed: boolean; href?: string }) {
  if (!allowed) return null;
  if (!href) {
    return (
      <Button disabled title="Disponible en una próxima entrega de la fase 2">
        <Plus className="h-4 w-4" aria-hidden />
        {label}
      </Button>
    );
  }
  return (
    <Link href={href} className={buttonClasses("primary")}>
      <Plus className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}
