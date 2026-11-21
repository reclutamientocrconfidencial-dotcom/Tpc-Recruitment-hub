import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl font-black text-brand-600">404</p>
      <h1 className="text-xl font-bold">Página no encontrada</h1>
      <p className="text-sm text-neutral-500">La dirección que buscó no existe o fue movida.</p>
      <Link href="/dashboard" className={buttonClasses("dark")}>Volver al dashboard</Link>
    </main>
  );
}
