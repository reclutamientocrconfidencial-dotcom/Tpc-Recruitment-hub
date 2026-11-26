import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { listPossibleDuplicates } from "@/modules/candidates/repository";
import { dismissDuplicateAction, mergeCandidatesAction } from "@/modules/candidates/actions";
import { MergeForm } from "@/modules/candidates/merge-form";
import { InlineAction } from "@/modules/common/inline-action";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Posibles duplicados" };

export default async function DuplicadosPage() {
  const user = await requireSessionUser();
  if (user.role !== "admin" && user.role !== "coordinador") return <Forbidden message="Solo administración y coordinación revisan duplicados." />;
  const pairs = await listPossibleDuplicates();
  return (
    <>
      <PageHeader title="Posibles duplicados" description="Coincidencias por correo, teléfono o nombre. Revise cada par: fusionar o marcar como personas distintas." />
      {pairs.error ? <Alert tone="error">{pairs.error}</Alert> : null}
      {pairs.data.length === 0 && !pairs.error ? (
        <Card className="px-6 py-12 text-center text-sm text-neutral-500">No hay posibles duplicados pendientes de revisión.</Card>
      ) : (
        <ul className="space-y-3">
          {pairs.data.map((p) => (
            <li key={`${p.candidate_a}-${p.candidate_b}`}>
              <Card className="space-y-3 px-5 py-4">
                <p className="text-sm">
                  <span className="font-semibold">A:</span>{" "}
                  <Link className="font-semibold text-brand-700 hover:underline" target="_blank" href={`/candidatos/${p.candidate_a}`}>
                    {p.name_a}
                  </Link>{" "}
                  · <span className="font-semibold">B:</span>{" "}
                  <Link className="font-semibold text-brand-700 hover:underline" target="_blank" href={`/candidatos/${p.candidate_b}`}>
                    {p.name_b}
                  </Link>{" "}
                  — coinciden en: {p.reasons.join(", ")}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <MergeForm action={mergeCandidatesAction} a={{ id: p.candidate_a, name: p.name_a }} b={{ id: p.candidate_b, name: p.name_b }} />
                  <InlineAction action={dismissDuplicateAction} fields={{ a: p.candidate_a, b: p.candidate_b }} label="Son personas distintas" variant="ghost" />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
