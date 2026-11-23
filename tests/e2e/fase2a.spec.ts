import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("demo@tpc-demo.test");
  await page.getByLabel("Contraseña").fill("DemoTPC2026");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.beforeEach(async ({ page }) => login(page));

test("clientes: búsqueda y filtros quedan en la URL", async ({ page }) => {
  await page.goto("/clientes");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.getByLabel("Buscar").fill("Logística");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(/q=Log%C3%ADstica/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByText("Mostrando 1–1 de 1")).toBeVisible();

  await page.goto("/clientes?estado=prospecto");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Servicios Demo Guanacaste S.A." })).toBeVisible();

  await page.getByRole("link", { name: "Limpiar filtros" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
});

test("clientes: parámetros inválidos se ignoran sin error", async ({ page }) => {
  await page.goto("/clientes?estado=borrado&page=-5&q=%27%3B--");
  await expect(page.getByRole("heading", { level: 1, name: "Clientes" })).toBeVisible();
  await expect(page.getByText("Sin resultados")).toBeVisible();
});

test("clientes: detalle, configuración y formulario (solo lectura en demostración)", async ({ page }) => {
  await page.goto("/clientes");
  await page.getByRole("link", { name: "Comercializadora Ficticia del Valle S.A." }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Comercializadora Ficticia del Valle S.A." })).toBeVisible();
  await expect(page.getByText("3-101-000001")).toBeVisible();
  await expect(page.getByText("REQ-2026-00001")).toBeVisible();

  await page.getByRole("link", { name: "Configuración" }).click();
  await expect(page.getByText("Este cliente usa el proceso estándar TPC.")).toBeVisible();
  await expect(page.getByLabel("Nombre de la etapa 1")).toHaveValue("Nuevo");
  await expect(page.getByText("Experiencia en ventas corporativas")).toBeVisible();

  await page.goto("/clientes/nuevo");
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page.getByText("Ingrese el nombre de la empresa.")).toBeVisible();
  await page.getByLabel("Nombre de la empresa").fill("Empresa Ficticia E2E");
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Modo demostración" })).toBeVisible();
});

test("clientes: identificador inválido muestra 404", async ({ page }) => {
  const res = await page.goto("/clientes/no-es-un-id");
  expect(res?.status()).toBe(404);
});

test("administración: usuarios, fuentes y proceso estándar", async ({ page }) => {
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Administración" }).click();
  await page.getByRole("link", { name: /Usuarios y roles/ }).click();
  await expect(page.getByText("coordinadora@tpc-demo.test")).toBeVisible();
  await page.goto("/administracion/usuarios?estado=inactivo");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByLabel(/Rol de Usuaria Demo/)).toHaveCount(0);

  await page.goto("/administracion/usuarios");
  await expect(page.getByLabel("Rol de Usuaria Demo")).toBeDisabled();

  await page.goto("/administracion/fuentes");
  await expect(page.getByRole("button", { name: "Desactivar WhatsApp" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Desactivar Feria de empleo" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(12);

  await page.goto("/administracion/procesos");
  await expect(page.getByLabel("Nombre de la etapa 8")).toHaveValue("Descartado");
  await page.getByRole("button", { name: "Agregar etapa" }).click();
  await expect(page.getByLabel("Nombre de la etapa 9")).toBeVisible();
});

test("ruta de salud sin datos", async ({ request }) => {
  const res = await request.get("/api/salud");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ estado: "ok", aplicacion: "ok", supabase: "demostracion" });
  expect(Object.keys(body).sort()).toEqual(["aplicacion", "estado", "hora", "ms", "supabase"]);
  expect(res.headers()["cache-control"]).toContain("no-store");
});
