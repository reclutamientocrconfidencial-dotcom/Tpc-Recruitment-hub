import { expect, test } from "@playwright/test";

/** Fase 4 en modo demostración: pantallas disponibles y navegación. */
test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("demo@tpc-demo.test");
  await page.getByLabel("Contraseña").fill("DemoTPC2026");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("administración: entrevistas y evaluaciones", async ({ page }) => {
  await page.goto("/administracion");
  await page.getByRole("link", { name: /Entrevistas y evaluaciones/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Entrevistas y evaluaciones" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Nueva pregunta del banco" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Nueva versión de la plantilla" })).toBeVisible();
});

test("candidatos: vencimientos y postulación con secciones de la fase 4", async ({ page }) => {
  await page.goto("/candidatos");
  await page.getByRole("link", { name: "Vencimientos" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Vencimientos de credenciales" })).toBeVisible();
  await expect(page.getByText("Sin vencimientos próximos")).toBeVisible();
  await page.goto("/postulaciones");
  await page.locator("tbody tr").first().getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Entrevistas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Informe ejecutivo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evaluaciones" })).toBeVisible();
});
