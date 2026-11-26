"use client";

import { startTransition, useActionState, useState } from "react";
import { FileSearch, Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type Doc = { id: string; file_name: string; mime: string };

/**
 * Lectura de un CV: archivo guardado (PDF o Word) o texto pegado. Un PDF se
 * lee en este navegador (la descarga queda registrada) y solo su texto viaja
 * al servidor; un Word se lee en el servidor.
 */
export function CvReadForm({ action, candidateId, documents }: { action: Action; candidateId: string; documents: Doc[] }) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const [mode, setMode] = useState<"archivo" | "texto">(documents.length ? "archivo" : "texto");
  const [reading, setReading] = useState(false);
  const busy = pending || reading;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const doc = mode === "archivo" ? documents.find((d) => d.id === fd.get("document_id")) : undefined;
    if (mode === "texto") fd.delete("document_id");
    if (doc?.mime === "application/pdf") {
      setReading(true);
      try {
        const res = await fetch(`/api/documentos/${doc.id}`, { credentials: "same-origin" });
        if (!res.ok) throw new Error("descarga");
        const { extractPdfText } = await import("@/lib/cv/extract-pdf");
        const { text, pages } = await extractPdfText(new Uint8Array(await res.arrayBuffer()));
        fd.set("text", text.slice(0, 120_000));
        fd.set("pages", String(pages));
      } catch {
        fd.set("pdf_error", "1");
        fd.delete("text");
      } finally {
        setReading(false);
      }
    }
    startTransition(() => formAction(fd));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label="Leer currículum">
      <input type="hidden" name="candidate_id" value={candidateId} />
      <div role="radiogroup" aria-label="Origen del currículum" className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="modo" checked={mode === "archivo"} disabled={!documents.length} onChange={() => setMode("archivo")} /> Archivo guardado (PDF o Word)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="modo" checked={mode === "texto"} onChange={() => setMode("texto")} /> Pegar texto
        </label>
      </div>
      {mode === "archivo" ? (
        <div className="space-y-1">
          <label htmlFor="cv-document" className="block text-sm font-medium">Currículum</label>
          <select id="cv-document" name="document_id" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm sm:max-w-md" required>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>{d.file_name}</option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-1">
          <label htmlFor="cv-text" className="block text-sm font-medium">Texto del currículum</label>
          <textarea id="cv-text" name="text" rows={6} maxLength={30000} required className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="Pegue aquí el texto del CV. Los datos personales se seudonimizan antes de analizarlo." />
        </div>
      )}
      <p className="text-xs text-neutral-500">
        Se extraen formación, trayectoria, funciones, logros, habilidades, idiomas, certificaciones y licencias. Los documentos escaneados (imagen) no
        se pueden leer: se marcan para completarlos a mano. Usted revisa y confirma todo antes de incorporarlo a la ficha.
      </p>
      <Button type="submit" variant="secondary" disabled={busy} aria-busy={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileSearch className="h-4 w-4" aria-hidden />}
        {reading ? "Leyendo PDF en su navegador…" : pending ? "Analizando…" : "Leer currículum"}
      </Button>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
    </form>
  );
}
