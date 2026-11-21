"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/env";

/** Cliente de Supabase para componentes de cliente (navegador). */
export function createSupabaseBrowserClient() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase no está configurado. Revise las variables NEXT_PUBLIC_SUPABASE_*.");
  }
  return createBrowserClient(config.url, config.anonKey);
}
