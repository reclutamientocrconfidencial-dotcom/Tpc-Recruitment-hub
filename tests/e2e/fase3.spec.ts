import { expect, test } from "@playwright/test";

/** Fase 3 en modo demostración: formulario público (sin sesión), validaciones y bandeja. */
test("formulario público: accesible sin sesión, con consentimiento y preguntas", async ({ page }) => {
  await page.goto("/p/demo2026ficticio");
  await expect(page).toHaveURL(/\/p\/demo2026ficticio$/);
  await expect(page.getByRole("heading", { level: 1, name: /Postúlese/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /licencia de conducir B1/ })).toBeVisible();
  await expect(page.getByText("Consentimiento informado (demostración)")).toBeVisible();
  // El campo trampa para robots no es visible ni accesible
  await expect(page.getByRole("textbox", { name: "Sitio web" })).toHaveCount(0);
  // Validación en español sin perder lo escrito
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Ana");
  await page.waitForTimeout(3_200);
  await page.getByRole("button", { name: "Enviar postulación" }).click();
  await expect(page.getByText("Revise los campos marcados.")).toBeVisible();
  await expect(page.getByText("Indique sus apellidos.")).toBeVisible();
  await expect(page.getByText("Debe aceptar el consentimiento informado para enviar su postulación.")).toBeVisible();
  await expect(page.getByText("Adjunte su currículum (PDF o Word).")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Nombre", exact: true })).toHaveValue("Ana");
  // Cantones según la provincia
  await expect(page.getByLabel("Cantón")).toBeDisabled();
  await page.getByLabel("Provincia").selectOption("Heredia");
  await expect(page.getByLabel("Cantón")).toBeEnabled();
});

test("formulario público: códigos inexistentes o inválidos", async ({ page }) => {
  await page.goto("/p/codigoinexistente");
  await expect(page.getByRole("heading", { name: "Formulario no disponible" })).toBeVisible();
  const res = await page.goto("/p/..%2Fadmin");
  expect(res?.status()).toBe(404);
});

test("recepción: visible para el personal en el menú", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("demo@tpc-demo.test");
  await page.getByLabel("Contraseña").fill("DemoTPC2026");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByRole("link", { name: "Recepción" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Recepción de candidatos" })).toBeVisible();
  await expect(page.getByText("Nada pendiente de revisión")).toBeVisible();
  await page.getByRole("link", { name: "Formularios, enlaces y QR" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Formularios públicos" })).toBeVisible();
});
