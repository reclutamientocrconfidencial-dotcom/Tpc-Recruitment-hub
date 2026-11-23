import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, USERS } from "./fixtures";

/**
 * Regresión (reportada en TEST): en un proceso por puesto, sustituir una etapa
 * por otra recién creada en el catálogo debe mantenerse tras guardar y recargar.
 */
const RUN = Date.now().toString().slice(-6);
const POSITION = `Capacitador(a) de Campo ficticio ${RUN}`;
const NEW_STAGE = `Prueba de campo ficticia ${RUN}`;

async function loginAs(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(USERS.admin.email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("proceso por puesto: la etapa sustituida se conserva al guardar y recargar", async ({ page }) => {
  await loginAs(page);
  await page.goto("/administracion/procesos");

  // 1) Proceso del puesto a partir del estándar TPC
  await page.getByRole("combobox", { name: "Puesto del proceso" }).fill(POSITION);
  await page.getByRole("option", { name: `Nuevo puesto «${POSITION}»` }).click();
  await page.getByLabel("Copiar etapas de").selectOption({ label: "Proceso estándar TPC" });
  await page.getByRole("button", { name: "Crear proceso del puesto" }).click();
  await expect(page.getByText("Proceso del puesto creado.")).toBeVisible();

  // 2) Etapa nueva en el catálogo
  await page.getByText("¿No encuentra la etapa? Agréguela al catálogo").click();
  await page.getByLabel("Nombre de la etapa").fill(NEW_STAGE);
  await page.getByLabel("Tipo", { exact: true }).first().selectOption("prueba");
  await page.getByRole("button", { name: "Agregar al catálogo" }).click();
  await expect(page.getByText(`Etapa «${NEW_STAGE}» agregada al catálogo.`)).toBeVisible();

  // 3) Sustituir "Prueba técnica" por la nueva etapa en el proceso del puesto
  await page.locator("summary", { hasText: POSITION }).click();
  const editor = page.getByRole("form", { name: `Etapas del proceso de ${POSITION}` });
  const row4 = editor.getByLabel("Etapa 4", { exact: true });
  await expect(row4.locator("option:checked")).toHaveText("Prueba técnica");
  await row4.selectOption({ label: NEW_STAGE });
  await editor.getByRole("button", { name: `Guardar proceso de ${POSITION}` }).click();
  await expect(editor.getByText("Proceso guardado correctamente.")).toBeVisible();

  // 4) Inmediatamente después de guardar
  await expect(editor.getByLabel("Etapa 4", { exact: true }).locator("option:checked")).toHaveText(NEW_STAGE);

  // 5) Tras recargar: todas las etapas seleccionadas y la sustitución conservada
  await page.reload();
  await page.locator("summary", { hasText: POSITION }).click();
  const reloaded = page.getByRole("form", { name: `Etapas del proceso de ${POSITION}` });
  await expect(reloaded.getByLabel("Etapa 4", { exact: true }).locator("option:checked")).toHaveText(NEW_STAGE);
  await expect(reloaded.getByTestId("tipo-4")).toHaveText("Prueba");
  for (let i = 1; i <= 8; i++) {
    await expect(reloaded.getByLabel(`Etapa ${i}`, { exact: true })).not.toHaveValue("");
  }
  // 6) Guardar de nuevo tras recargar (sin cambios) y recargar otra vez: sigue igual
  await reloaded.getByRole("button", { name: `Guardar proceso de ${POSITION}` }).click();
  await expect(reloaded.getByText("Proceso guardado correctamente.")).toBeVisible();
  await expect(reloaded.getByLabel("Etapa 4", { exact: true }).locator("option:checked")).toHaveText(NEW_STAGE);
  await page.reload();
  await page.locator("summary", { hasText: POSITION }).click();
  await expect(
    page.getByRole("form", { name: `Etapas del proceso de ${POSITION}` }).getByLabel("Etapa 4", { exact: true }).locator("option:checked"),
  ).toHaveText(NEW_STAGE);

  // El proceso estándar no se modificó
  const standard = page.getByRole("form", { name: "Etapas del proceso", exact: true });
  await expect(standard.getByLabel("Etapa 4", { exact: true }).locator("option:checked")).toHaveText("Prueba técnica");
});
