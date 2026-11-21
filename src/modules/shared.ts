import "server-only";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface ListResult<T> {
  data: T[];
  error: string | null;
}

/**
 * Ejecuta una consulta contra Supabase (sujeta a RLS) o devuelve datos
 * ficticios en modo demostración. Los errores se registran en el servidor y
 * se devuelve un mensaje genérico en español (sin filtrar detalles internos).
 */
export async function runQuery<T>(
  demoData: () => T[],
  query: (supabase: SupabaseServerClient) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<ListResult<T>> {
  if (isDemoMode()) return { data: demoData(), error: null };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await query(supabase);
    if (error) {
      console.error("[supabase]", error.message);
      return { data: [], error: "No fue posible cargar la información. Intente de nuevo." };
    }
    return { data: (data as T[] | null) ?? [], error: null };
  } catch (err) {
    console.error("[supabase]", err);
    return { data: [], error: "No fue posible conectar con la base de datos." };
  }
}

export const DEFAULT_PAGE_SIZE = 50;
