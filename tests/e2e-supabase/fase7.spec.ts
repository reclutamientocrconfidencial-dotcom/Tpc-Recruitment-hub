import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, USERS, env, type UserKey } from "./fixtures";
import { parseXlsx } from "../../src/lib/import/xlsx";

/** Fase 7: tablero ejecutivo con alcance por rol y exportaciones controladas (motivo, rol, registro). */
async function loginAs(page: Page, user: UserKey) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(USERS[user].email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("coordinación: tablero ejecutivo y exportación a Excel con motivo registrado", async ({ page, request }) => {
  await loginAs(page, "coordinador");
  await page.getByRole("link", { name: "Indicadores" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Indicadores gerenciales" })).toBeVisible();
  const summary = page.getByRole("region", { name: "Resumen ejecutivo" });
  await expect(summary).toContainText("Vacantes abiertas");
  await expect(summary).toContainText("Contrataciones del período");
  await expect(page.getByRole("table", { name: "Embudo por tipo de etapa" })).toContainText("Contratado");
  await expect(page.getByRole("table", { name: "Desempeño por reclutador" })).toContainText(USERS.reclutador.name);
  await expect(page.getByRole("table", { name: "Desempeño por cliente" }).locator("tbody tr")).not.toHaveCount(0);

  const form = page.getByRole("form", { name: "Exportar datos" });
  await expect(form.getByRole("option", { name: /Base de candidatos/ })).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Exportar" })).toBeDisabled();
  const reason = `Informe mensual ficticio E2E ${Date.now()}`;
  await form.getByLabel("Conjunto de datos").selectOption("postulaciones");
  await form.getByLabel(/Motivo de la exportación/).fill(reason);
  const [download] = await Promise.all([page.waitForEvent("download"), form.getByRole("button", { name: "Exportar" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^postulaciones_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const rows = parseXlsx(new Uint8Array(Buffer.concat(chunks)));
  expect(rows[0]).toEqual(["Fecha de postulación", "Candidato", "Vacante", "Cliente", "Etapa", "Tipo de etapa", "Fecha de contratación", "Motivo de descarte", "Fuente", "Responsable"]);
  expect(rows.length).toBeGreaterThan(1);
  expect(rows.flat().join(" ")).not.toMatch(/@correo\.test|@tpc-demo\.test/);

  // La exportación quedó en el registro de accesos con su motivo
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  const tok = await request.post(`${url}/auth/v1/token?grant_type=password`, { headers: { apikey: key }, data: { email: USERS.admin.email, password: PASSWORD } });
  const { access_token } = (await tok.json()) as { access_token: string };
  const logs = await request.get(`${url}/rest/v1/access_logs?select=item_count&action=eq.exportar&resource=eq.exportacion_postulaciones&reason=eq.${encodeURIComponent(reason)}`, {
    headers: { apikey: key, Authorization: `Bearer ${access_token}` },
  });
  const found = (await logs.json()) as Array<{ item_count: number }>;
  expect(found).toHaveLength(1);
  expect(found[0]!.item_count).toBe(rows.length - 1);
});

test("exportación: CSV de indicadores y protección contra solicitudes de otro origen", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/indicadores");
  const form = page.getByRole("form", { name: "Exportar datos" });
  await expect(form.getByRole("option", { name: /Base de candidatos/ })).toHaveCount(1);
  await form.getByLabel("Conjunto de datos").selectOption("fuentes");
  await form.getByLabel("Formato").selectOption("csv");
  await form.getByLabel(/Motivo de la exportación/).fill("Revisión ficticia de fuentes de reclutamiento");
  const [download] = await Promise.all([page.waitForEvent("download"), form.getByRole("button", { name: "Exportar" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^fuentes_.*\.csv$/);
  // Otro origen: rechazado aunque haya sesión
  const forged = await page.request.post("/api/exportaciones", {
    headers: { Origin: "https://sitio-malicioso.example" },
    form: { dataset: "candidatos", format: "csv", reason: "Intento desde otro sitio", desde: "2026-01-01", hasta: "2026-12-31" },
  });
  expect(forged.status()).toBe(403);
});

test("alcance por rol: reclutador ve lo suyo y no exporta; consulta ve agregados", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto("/indicadores");
  await expect(page.getByText("Sus postulaciones y vacantes asignadas.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Desempeño por reclutador" }).locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("form", { name: "Exportar datos" })).toHaveCount(0);
  const res = await page.request.post("/api/exportaciones", {
    headers: { Origin: new URL(page.url()).origin },
    form: { dataset: "fuentes", format: "csv", reason: "Intento sin permiso ficticio", desde: "2026-01-01", hasta: "2026-12-31" },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(303);
  expect(new URL(res.headers()["location"]!).searchParams.get("exportacion")).toBe("No tiene permiso para exportar.");
  await page.context().clearCookies();
  await loginAs(page, "consulta");
  await page.goto("/indicadores");
  await expect(page.getByText("Tablero ejecutivo de reclutamiento. Datos agregados, sin información personal.")).toBeVisible();
  await expect(page.getByRole("form", { name: "Exportar datos" })).toHaveCount(0);
  await page.goto("/indicadores?desde=2020-01-01&hasta=2026-12-31");
  await expect(page.getByText("Rango de fechas no válido (máximo dos años).")).toBeVisible();
});
