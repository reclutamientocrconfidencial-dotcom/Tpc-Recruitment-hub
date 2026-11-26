import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Postulación enviada", robots: { index: false, follow: false } };

export default async function SentPage({ searchParams }: { searchParams: Promise<{ cv?: string }> }) {
  const { cv } = await searchParams;
  return (
    <Card className="p-8 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold text-ink-950">¡Gracias! Recibimos su postulación</h1>
      <p className="mt-2 text-sm text-neutral-600">Nuestro equipo de reclutamiento la revisará y le contactará si su perfil avanza en el proceso.</p>
      {cv === "0" ? (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800" role="status">
          No pudimos recibir su currículum. Su postulación sí quedó registrada; el equipo podrá solicitárselo.
        </p>
      ) : null}
      <p className="mt-6 text-xs text-neutral-500">Puede cerrar esta página.</p>
    </Card>
  );
}
