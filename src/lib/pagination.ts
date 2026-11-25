/** Paginación en servidor: 25 registros por página (plan fase 2, §2). */
export const PAGE_SIZE = 25;
export const MAX_PAGE = 10_000;

export function parsePage(value: unknown): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PAGE);
}

/** Rango inclusivo [desde, hasta] para `.range()` de Supabase. */
export function pageRange(page: number, size = PAGE_SIZE): [number, number] {
  const from = (page - 1) * size;
  return [from, from + size - 1];
}

export function totalPages(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  error: string | null;
}

/** Pagina un arreglo en memoria (modo demostración). */
export function paginateArray<T>(rows: T[], page: number, size = PAGE_SIZE): Paged<T> {
  const [from, to] = pageRange(page, size);
  return { rows: rows.slice(from, to + 1), total: rows.length, page, pageSize: size, error: null };
}
