import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("demo@tpc-demo.test");
  await page.getByLabel("Contraseña").fill("DemoTPC2026");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.beforeEach(async ({ page }) => login(page));

test("requisiciones: filtros en la URL, cobertura y detalle", async ({ page }) => {
  await page.goto("/requisiciones");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.getByLabel("Estado").selectOption("pendiente_aprobacion");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/estado=pendiente_aprobacion/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Recepcionista bilingüe" })).toBeVisible();

  await page.goto("/requisiciones?prioridad=urgente&estado=inexistente&page=-1");
  await expect(page.locator("tbody tr")).toHaveCount(1);

  await page.goto("/requisiciones");
  await page.getByRole("link", { name: "Ejecutivo(a) de ventas" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ejecutivo(a) de ventas" })).toBeVisible();
  await expect(page.getByText("3 plazas solicitadas")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ejecutivo(a) de ventas corporativas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cerrar", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nueva vacante" })).toBeVisible();
});

test("requisiciones: formulario valida y conserva los datos (demostración)", async ({ page }) => {
  await page.goto("/requisiciones/nueva");
  await page.getByLabel("Título del puesto solicitado").fill("Puesto ficticio");
  await page.getByLabel("Salario mínimo").fill("900");
  await page.getByLabel("Salario máximo").fill("100");
  await page.getByRole("button", { name: "Crear requisición" }).click();
  await expect(page.getByText("Seleccione el cliente.")).toBeVisible();
  await expect(page.getByText("El salario mínimo no puede ser mayor que el máximo.")).toBeVisible();
  await expect(page.getByLabel("Título del puesto solicitado")).toHaveValue("Puesto ficticio");
});

test("vacantes: filtros, seguimiento de plazas, proceso y requisitos", async ({ page }) => {
  await page.goto("/vacantes?pendientes=1&modalidad=hibrido");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("link", { name: "Ejecutivo(a) de ventas corporativas" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ejecutivo(a) de ventas corporativas" })).toBeVisible();
  await expect(page.getByText("0/3 cubiertas")).toBeVisible();
  await expect(page.getByLabel("Plazas cubiertas (de 3)")).toBeVisible();
  await expect(page.getByText("Hereda: Proceso estándar TPC.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Personalizar proceso" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cargar sugeridos" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Duplicar" })).toBeVisible();

  await page.getByRole("button", { name: "Personalizar proceso" }).click();
  await expect(page.getByText("Modo demostración: los cambios no se guardan.")).toBeVisible();
});

test("vacantes: alta desde requisición con datos heredados", async ({ page }) => {
  await page.goto("/vacantes/nueva?requisicion=22222222-0000-4000-8000-000000000002");
  await expect(page.getByLabel("Título de la vacante")).toHaveValue("Analista de inventarios");
  await expect(page.getByLabel("Fecha límite")).toHaveValue("2027-01-05");
  await page.getByLabel("Título de la vacante").fill("");
  await page.getByRole("button", { name: "Crear vacante" }).click();
  await expect(page.getByText("Indique el título de la vacante.")).toBeVisible();
});
