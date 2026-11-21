"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-brand-200 bg-white p-8 text-center">
      <h1 className="text-lg font-bold text-ink-950">Ocurrió un error inesperado</h1>
      <p className="mt-2 text-sm text-neutral-500">Intente nuevamente. Si el problema persiste, contacte a soporte.</p>
      <Button className="mt-6" onClick={reset}>Reintentar</Button>
    </div>
  );
}
