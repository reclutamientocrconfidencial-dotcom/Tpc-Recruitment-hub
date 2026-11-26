import { Logo } from "@/components/layout/logo";
import { COMPANY_NAME } from "@/lib/env";

/** Diseño de las páginas públicas (sin menú ni datos internos). */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b-4 border-brand-600 bg-white">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-4">
          <Logo />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-8 text-xs text-neutral-500">
        © {new Date().getFullYear()} {COMPANY_NAME} · Costa Rica. Sus datos se tratan conforme a la Ley N.° 8968.
      </footer>
    </div>
  );
}
