import { expect, test } from "@playwright/test";

/** Fase 7 en modo demostración: el tablero se muestra sin datos y la exportación no entrega archivos. */
test("indicadores gerenciales", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("demo@tpc-demo.test");
  await page.getByLabel("Contraseña").fill("DemoTPC2026");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: "Indicadores" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Indicadores gerenciales" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumen ejecutivo" })).toContainText("Vacantes abiertas");
  await expect(page.getByRole("form", { name: "Exportar datos" })).toBeVisible();
});
