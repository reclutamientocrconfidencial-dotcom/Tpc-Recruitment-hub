import { Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

/** Tabla genérica con estados de error y vacío, reutilizada por todos los módulos. */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  error,
  emptyTitle,
  emptyDescription,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  error?: string | null;
  emptyTitle: string;
  emptyDescription?: string;
  caption: string;
}) {
  if (error) return <Alert tone="error" title="Error">{error}</Alert>;

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-3 rounded-full bg-brand-50 p-3 text-brand-600">
          <Inbox className="h-6 w-6" aria-hidden />
        </div>
        <p className="font-semibold text-ink-950">{emptyTitle}</p>
        {emptyDescription ? <p className="mt-1 max-w-sm text-sm text-neutral-500">{emptyDescription}</p> : null}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-ink-950 text-left text-xs font-semibold uppercase tracking-wide text-white">
            <tr>
              {columns.map((col) => (
                <th key={col.header} scope="col" className={`px-4 py-3 ${col.className ?? ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-brand-50/40">
                {columns.map((col) => (
                  <td key={col.header} className={`whitespace-nowrap px-4 py-3 text-neutral-700 ${col.className ?? ""}`}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-2 text-xs text-neutral-500">
        {rows.length} {rows.length === 1 ? "registro" : "registros"}
      </div>
    </Card>
  );
}
