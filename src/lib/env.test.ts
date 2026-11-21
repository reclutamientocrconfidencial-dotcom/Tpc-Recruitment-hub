import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseConfig, isDemoMode } from "@/lib/env";

afterEach(() => vi.unstubAllEnvs());

describe("configuración de entorno", () => {
  it("sin variables, Supabase no está configurado", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
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

describe("claves de Supabase", () => {
  it("acepta la clave publishable (proyectos nuevos)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ejemplo.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ficticia");
    expect(getSupabaseConfig()?.anonKey).toBe("sb_publishable_ficticia");
  });

  it("rechaza claves secretas en variables públicas", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ejemplo.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_ficticia");
    expect(() => getSupabaseConfig()).toThrow(/SECRETA/);
    const fakeServiceJwt = `x.${btoa(JSON.stringify({ role: "service_role" }))}.y`;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", fakeServiceJwt);
    expect(() => getSupabaseConfig()).toThrow(/SECRETA/);
  });
});
