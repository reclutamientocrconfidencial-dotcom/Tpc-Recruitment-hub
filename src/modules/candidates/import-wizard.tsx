"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/form";
import { parseCsv } from "@/lib/import/csv";
import { CONSENT_CHANNEL, optionsFrom } from "@/modules/labels";
import { IMPORT_CHUNK, IMPORT_COLUMNS, MAX_IMPORT_ROWS, mapHeaders, type ImportKey } from "@/modules/candidates/schema";
import { addImportRowsAction, createImportBatchAction, finishImportAction } from "@/modules/candidates/import-actions";
import type { ConsentText } from "@/types/database";

const MAX_BYTES = 10 * 1024 * 1024;

interface Parsed {
  fileName: string;
  rows: Array<{ row_number: number; values: Partial<Record<ImportKey, string>> }>;
  missing: string[];
  mapped: string[];
}

/** Lee el archivo en el navegador (CSV o Excel): el archivo completo nunca se sube al servidor. */
async function readFile(file: File): Promise<string[][]> {
  if (file.size > MAX_BYTES) throw new Error("El archivo supera 10 MB.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(await file.text(), MAX_IMPORT_ROWS + 1);
  if (name.endsWith(".xlsx")) {
    const { parseXlsx } = await import("@/lib/import/xlsx");
    return parseXlsx(new Uint8Array(await file.arrayBuffer()), MAX_IMPORT_ROWS + 1);
  }
  throw new Error("Formato no admitido: use .csv o .xlsx (Excel).");
}

export function ImportWizard({ consentText }: { consentText: ConsentText | null }) {
  const router = useRouter();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setParsed(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const table = await readFile(file);
      if (table.length < 2) throw new Error("El archivo no tiene filas de datos.");
      const { map, missing } = mapHeaders(table[0]!);
      const dataRows = table.slice(1);
      if (dataRows.length > MAX_IMPORT_ROWS) throw new Error(`Máximo ${MAX_IMPORT_ROWS.toLocaleString("es-CR")} filas por archivo.`);
      const rows = dataRows.map((cells, i) => {
        const values: Partial<Record<ImportKey, string>> = {};
        for (const [key, idx] of Object.entries(map) as Array<[ImportKey, number]>) values[key] = (cells[idx] ?? "").slice(0, 500);
        return { row_number: i + 2, values };
      });
      setParsed({ fileName: file.name, rows, missing, mapped: IMPORT_COLUMNS.filter((c) => map[c.key] !== undefined).map((c) => c.label) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible leer el archivo.");
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!parsed || !consentText) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const created = await createImportBatchAction({
        file_name: parsed.fileName,
        consent_text_id: consentText.id,
        consent_channel: String(fd.get("consent_channel") ?? ""),
        consent_evidence: String(fd.get("consent_evidence") ?? ""),
        reason: String(fd.get("reason") ?? ""),
        consent_confirm: fd.get("consent_confirm") === "on" ? "on" : "",
      });
      if (!created.id) {
        setError(created.error ?? "No fue posible crear el lote.");
        setFieldErrors(created.fieldErrors ?? {});
        return;
      }
      for (let i = 0; i < parsed.rows.length; i += IMPORT_CHUNK) {
        setProgress(`Validando filas ${i + 1}–${Math.min(i + IMPORT_CHUNK, parsed.rows.length)} de ${parsed.rows.length}…`);
        const r = await addImportRowsAction(created.id, parsed.rows.slice(i, i + IMPORT_CHUNK));
        if (r.error) {
          setError(`${r.error} (el lote quedó incompleto; cancélelo e intente de nuevo).`);
          return;
        }
      }
      const done = await finishImportAction(created.id);
      if (done.error) {
        setError(done.error);
        return;
      }
      router.push(`/candidatos/importar/${created.id}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Importar candidatos" className="space-y-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold">1. Archivo</h2>
        <p className="mb-2 text-sm text-neutral-600">
          CSV o Excel (.xlsx), primera hoja, con los encabezados de la{" "}
          <Link href="/candidatos/importar/plantilla" prefetch={false} className="font-semibold text-brand-600 hover:underline">
            plantilla
          </Link>
          . Máximo {MAX_IMPORT_ROWS.toLocaleString("es-CR")} filas. El archivo se lee en su navegador.
        </p>
        <label htmlFor="archivo" className="sr-only">
          Archivo de candidatos
        </label>
        <input id="archivo" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFile} className="text-sm" />
        {parsed ? (
          <div className="mt-3 text-sm" role="status">
            <p>
              <span className="font-semibold">{parsed.rows.length.toLocaleString("es-CR")}</span> filas en «{parsed.fileName}».
            </p>
            <p className="text-neutral-600">Columnas reconocidas: {parsed.mapped.join(", ") || "ninguna"}.</p>
            {parsed.missing.length > 0 ? <Alert tone="error" className="mt-2">Faltan columnas obligatorias: {parsed.missing.join(", ")}.</Alert> : null}
          </div>
        ) : null}
      </div>

      <div>
        <h2 className="text-base font-semibold">2. Consentimiento informado (Ley 8968)</h2>
        {consentText ? (
          <p className="mb-2 text-sm text-neutral-600">
            Versión vigente: <span className="font-semibold">{consentText.version}</span>
            {consentText.legal_approved ? "" : " — borrador sin aprobación jurídica (solo datos ficticios)"}.
          </p>
        ) : (
          <Alert tone="error">No hay una versión vigente del consentimiento.</Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="consent_channel" label="¿Cómo otorgaron el consentimiento?" required error={fieldErrors.consent_channel}>
            <SelectInput id="consent_channel" defaultValue="" placeholder="Seleccione…" options={optionsFrom(CONSENT_CHANNEL)} error={fieldErrors.consent_channel} />
          </Field>
          <Field id="consent_evidence" label="Evidencia" required error={fieldErrors.consent_evidence} hint="Dónde consta el consentimiento de cada persona">
            <TextInput id="consent_evidence" maxLength={300} error={fieldErrors.consent_evidence} />
          </Field>
          <Field id="reason" label="Motivo de la importación" required error={fieldErrors.reason} className="sm:col-span-2">
            <TextInput id="reason" maxLength={300} error={fieldErrors.reason} />
          </Field>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent_confirm" className="mt-0.5 h-4 w-4 accent-brand-600" />
          Declaro que todas las personas del archivo otorgaron su consentimiento informado y que la información es correcta.
        </label>
        {fieldErrors.consent_confirm ? <p className="mt-1 text-xs text-brand-700">{fieldErrors.consent_confirm}</p> : null}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {progress ? (
        <p className="flex items-center gap-2 text-sm text-neutral-700" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {progress}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !parsed || parsed.missing.length > 0 || !consentText}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          3. Validar archivo
        </Button>
      </div>
      <p className="text-xs text-neutral-500">
        La validación no crea candidatos: verá un informe con errores y posibles duplicados para decidir antes de importar.
      </p>
    </form>
  );
}
