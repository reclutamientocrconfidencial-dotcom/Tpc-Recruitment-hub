import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Botón de alta. En la fase 1 está deshabilitado: los formularios llegan en la fase 2. */
export function CreateButton({ label, allowed }: { label: string; allowed: boolean }) {
  if (!allowed) return null;
  return (
    <Button disabled title="Disponible en la fase 2">
      <Plus className="h-4 w-4" aria-hidden />
      {label}
    </Button>
  );
}
