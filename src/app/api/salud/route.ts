import { NextResponse } from "next/server";
import { getSupabaseConfig, isDemoMode } from "@/lib/env";

/**
 * Ruta de salud para monitoreo (fase 8, incorporada en 2A).
 * No expone datos: solo indica si la aplicación responde y si el servicio de
 * autenticación de Supabase está disponible.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let baseDatos: "ok" | "error" | "no_configurada" | "demostracion" = "no_configurada";

  if (isDemoMode()) {
    baseDatos = "demostracion";
  } else {
    const config = getSupabaseConfig();
    if (config) {
      try {
        const res = await fetch(`${config.url}/auth/v1/health`, {
          headers: { apikey: config.anonKey },
          signal: AbortSignal.timeout(4000),
          cache: "no-store",
        });
        baseDatos = res.ok ? "ok" : "error";
      } catch {
        baseDatos = "error";
      }
    }
  }

  const ok = baseDatos === "ok" || baseDatos === "demostracion";
  return NextResponse.json(
    {
      estado: ok ? "ok" : "degradado",
      aplicacion: "ok",
      version: process.env.NEXT_PUBLIC_BUILD_ID ?? "local",
      supabase: baseDatos,
      ms: Date.now() - started,
      hora: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
