import { expect, test } from "@playwright/test";

/** Fase 6 en modo demostración: Mi jornada y productividad disponibles para el personal operativo. */
test("mi jornada y productividad", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("demo@tpc-demo.test");
  await page.getByLabel("Contraseña").fill("DemoTPC2026");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("link", { name: "Mi jornada" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mi jornada" })).toBeVisible();
  await expect(page.getByLabel("Resumen del día")).toContainText("Atrasados");
  await expect(page.getByRole("form", { name: "Nueva tarea" })).toBeVisible();
  await page.getByRole("link", { name: "Productividad" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Indicadores de gestión y productividad" })).toBeVisible();
});
