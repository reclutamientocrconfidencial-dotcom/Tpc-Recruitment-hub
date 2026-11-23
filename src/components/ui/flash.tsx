import { CheckCircle2 } from "lucide-react";

const MESSAGES: Record<string, string> = {
  creado: "Registro creado correctamente.",
  actualizado: "Cambios guardados correctamente.",
  desactivado: "Registro desactivado.",
  activado: "Registro activado.",
  configurado: "Configuración guardada.",
};

/** Mensaje de confirmación tras redirigir (?ok=...). Solo valores conocidos. */
export function Flash({ code }: { code?: string }) {
  const text = code ? MESSAGES[code] : undefined;
  if (!text) return null;
  return (
    <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      <CheckCircle2 className="h-4 w-4" aria-hidden />
      {text}
    </div>
  );
}
