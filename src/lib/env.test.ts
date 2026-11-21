import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseConfig, isDemoMode } from "@/lib/env";

afterEach(() => vi.unstubAllEnvs());

describe("configuración de entorno", () => {
  it("sin variables, Supabase no está configurado", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(getSupabaseConfig()).toBeNull();
  });

  it("el modo demostración requiere la bandera explícita", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("TPC_DEMO_MODE", "false");
    expect(isDemoMode()).toBe(false);
    vi.stubEnv("TPC_DEMO_MODE", "true");
    expect(isDemoMode()).toBe(true);
  });

  it("el modo demostración NUNCA se activa si Supabase está configurado", () => {
    vi.stubEnv("TPC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ejemplo.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "clave-ficticia");
    expect(isDemoMode()).toBe(false);
  });
});
