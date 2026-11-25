import { expect, test } from "@playwright/test";

/** Fase 5 en modo demostración: la IA no está disponible sin base de datos. */
test("administración: página de inteligencia artificial", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("demo@tpc-demo.test");
  await page.getByLabel("Contraseña").fill("DemoTPC2026");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/administracion");
  await page.getByRole("link", { name: /Inteligencia artificial/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Inteligencia artificial" })).toBeVisible();
  await expect(page.getByText(/proveedor externo exige autorización de costos/)).toBeVisible();
  await page.goto("/postulaciones");
  await page.locator("tbody tr").first().getByRole("link").first().click();
  await expect(page.getByText(/Desactivado\. Administración puede activarlo/)).toBeVisible();
});
