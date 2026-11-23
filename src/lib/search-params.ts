export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Primer valor de un parámetro de búsqueda, recortado. */
export function param(sp: RawSearchParams, key: string): string {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? "").trim().slice(0, 200);
}

/** Valor permitido de una lista cerrada (o cadena vacía). */
export function oneOf<T extends string>(value: string, allowed: readonly T[]): T | "" {
  return (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

/**
 * Limpia el texto de búsqueda para usarlo en filtros de PostgREST (`ilike`):
 * elimina caracteres con significado especial (`,()*%\:`) y limita el largo.
 */
export function sanitizeSearch(value: string): string {
  return value.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Construye una URL conservando filtros y aplicando cambios (valores vacíos se eliminan). */
export function hrefWith(path: string, current: Record<string, string>, changes: Record<string, string | number | null>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...changes })) {
    if (v !== null && v !== undefined && String(v) !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
