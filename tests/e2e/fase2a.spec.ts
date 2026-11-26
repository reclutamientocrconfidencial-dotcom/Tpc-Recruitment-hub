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
  await expect(page.getByLabel("Etapa 1", { exact: true }).locator("option:checked")).toHaveText("Nuevo");
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
  await expect(page.getByLabel("Etapa 8", { exact: true }).locator("option:checked")).toHaveText("Descartado");
  await page.getByRole("button", { name: "Agregar etapa" }).click();
  await expect(page.getByLabel("Etapa 9", { exact: true })).toBeVisible();
  await expect(page.getByText("Falta al menos una etapa")).toHaveCount(0);
});

test("ruta de salud sin datos", async ({ request }) => {
  const res = await request.get("/api/salud");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ estado: "ok", aplicacion: "ok", supabase: "demostracion" });
  expect(Object.keys(body).sort()).toEqual(["aplicacion", "estado", "hora", "ms", "supabase", "version"]);
  expect(body.version).toMatch(/^([0-9a-f]{7}|local)$/);
  expect(res.headers()["cache-control"]).toContain("no-store");
});

test("catálogo de etapas: categoría y tipo automáticos al elegir una etapa", async ({ page }) => {
  await page.goto("/administracion/procesos");
  const stage2 = page.getByLabel("Etapa 2", { exact: true });
  await stage2.selectOption({ label: "Prueba de Excel" });
  await expect(page.getByTestId("categoria-2")).toHaveText("En proceso");
  await expect(page.getByTestId("tipo-2")).toHaveText("Prueba");
  await expect(page.getByLabel("Plazo en días de la etapa 2")).toHaveValue("3");
  // Una etapa ya usada en el proceso no se puede repetir
  await expect(stage2.locator("option", { hasText: /^Oferta$/ })).toBeDisabled();
  await stage2.selectOption({ label: "Entrevista con el cliente" });
  await expect(page.getByTestId("tipo-2")).toHaveText("Entrevista");
  // Quitar la etapa "Contratado" muestra la advertencia
  await page.getByRole("button", { name: "Quitar etapa 7" }).click();
  await expect(page.getByText("Falta al menos una etapa de categoría: Contratado.")).toBeVisible();
});

test("catálogos: puestos con búsqueda, requisitos y niveles", async ({ page }) => {
  await page.goto("/administracion/catalogos");
  await page.getByRole("link", { name: /Puestos/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await page.getByLabel("Buscar").fill("bodeg");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("cell", { name: "Bodeguero(a)", exact: true })).toBeVisible();

  await page.goto("/administracion/catalogos/requisitos");
  await expect(page.getByRole("row", { name: /Inglés.*Idiomas \(MCER\)/ })).toBeVisible();

  await page.goto("/administracion/catalogos/niveles");
  await expect(page.getByRole("heading", { name: "Idiomas (MCER)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Desactivar nivel B2 de Idiomas (MCER)" })).toBeVisible();

  await page.goto("/administracion/catalogos/etapas");
  await expect(page.getByRole("button", { name: "Desactivar etapa Prueba de inglés" })).toBeVisible();
});

test("requisitos: buscador del catálogo y nivel según la escala", async ({ page }) => {
  await page.goto("/clientes/11111111-0000-4000-8000-000000000001/configuracion");
  const req = page.getByRole("combobox", { name: "Requisito" });
  await req.fill("ingl");
  await page.getByRole("option", { name: /Inglés/ }).click();
  await expect(page.getByLabel("Nivel mínimo")).toBeEnabled();
  await expect(page.getByLabel("Nivel mínimo").locator("option")).toHaveText(["Cualquiera", "A1", "A2", "B1", "B2", "C1", "C2", "Nativo"]);
  await req.fill("Licencia de conducir B1");
  await page.getByRole("option", { name: /Licencia de conducir B1/ }).click();
  await expect(page.getByLabel("Nivel mínimo").locator("option")).toHaveText(["Cualquiera", "Cumple"]);
  // Texto libre: ofrece crear un requisito nuevo
  await req.fill("Power BI avanzado");
  await expect(page.getByRole("option", { name: "Nuevo requisito «Power BI avanzado»" })).toBeVisible();
});

test("catálogo de requisitos: edición con historial (solo lectura en demostración)", async ({ page }) => {
  await page.goto("/administracion/catalogos/requisitos");
  await page.getByRole("link", { name: "Editar requisito SAP" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Editar: SAP" })).toBeVisible();
  await expect(page.getByLabel("Nombre del requisito")).toHaveValue("SAP");
  await expect(page.getByLabel("Escala de dominio")).toBeEnabled();
  await page.getByLabel("Nombre del requisito").fill("");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Nombre del requisito: mínimo 2 caracteres.")).toBeVisible();
  await page.getByLabel("Nombre del requisito").fill("SAP S/4HANA");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Modo demostración: los cambios no se guardan.")).toBeVisible();
  await expect(page.getByLabel("Nombre del requisito")).toHaveValue("SAP S/4HANA");
  await expect(page.getByText("Sin cambios registrados.")).toBeVisible();
});
