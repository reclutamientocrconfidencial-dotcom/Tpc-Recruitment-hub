import { defineConfig, devices } from "@playwright/test";

/**
 * E2E contra un Supabase LOCAL (`npx supabase start`) con usuarios ficticios.
 * Requiere: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY del stack local
 * (los imprime `npx supabase status -o env`). La clave secreta solo la usa el
 * script de preparación de pruebas; la aplicación nunca la recibe.
 */
const PORT = Number(process.env.E2E_PORT ?? 3200);
// `wrangler dev` reescribe el host a «localhost»: al probar sobre workerd use E2E_HOST=localhost.
const HOST = process.env.E2E_HOST ?? "127.0.0.1";

export default defineConfig({
  testDir: "tests/e2e-supabase",
  globalSetup: "./tests/e2e-supabase/global-setup.ts",
  timeout: 30_000,
  workers: 1,
  use: { baseURL: `http://${HOST}:${PORT}`, trace: "off", ...devices["Desktop Chrome"] },
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: process.env.E2E_REUSE === "true",
    timeout: 120_000,
    env: {
      TPC_DEMO_MODE: "false",
      NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
      // Clave ficticia del stack LOCAL (supabase/seed.sql). En TEST/producción es un secreto del Worker.
      PUBLIC_FORM_KEY: "clave-local-ficticia-solo-desarrollo-0123456789abcdef",
    },
  },
});
