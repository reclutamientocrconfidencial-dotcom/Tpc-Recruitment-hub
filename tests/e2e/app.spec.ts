import { expect, test, type Page } from "@playwright/test";

const DEMO = { email: "demo@tpc-demo.test", password: "DemoTPC2026" };

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(DEMO.email);
  await page.getByLabel("Contraseña").fill(DEMO.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("rutas protegidas redirigen al inicio de sesión", async ({ page }) => {
  await page.goto("/candidatos");
  await expect(page).toHaveURL(/\/login\?next=%2Fcandidatos$/);
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
});

test("valida el formulario en español", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("no-es-correo");
  await page.getByLabel("Contraseña").fill("123");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByText("Ingrese un correo electrónico válido.")).toBeVisible();
  await expect(page.getByText("La contraseña debe tener al menos 8 caracteres.")).toBeVisible();
});

test("rechaza credenciales incorrectas con mensaje genérico", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(DEMO.email);
  await page.getByLabel("Contraseña").fill("ContraseñaIncorrecta");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Correo o contraseña incorrectos." })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("inicio de sesión, dashboard y navegación por módulos", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Hola, Usuaria" })).toBeVisible();
  await expect(page.getByTestId("kpi-vacantes")).toHaveText("1");
  await expect(page.getByTestId("kpi-candidatos")).toHaveText("3");
  await expect(page.getByText("Modo demostración · datos ficticios")).toBeVisible();

  const modules: Array<[string, string]> = [
    ["Clientes", "Comercializadora Ficticia del Valle S.A."],
    ["Requisiciones", "REQ-2026-00001"],
    ["Vacantes", "Ejecutivo(a) de ventas corporativas"],
    ["Candidatos", "Daniela Inventada Castro"],
    ["Postulaciones", "Carlos Ficticio Rojas"],
  ];
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  for (const [label, sample] of modules) {
    await nav.getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
    await expect(page.getByRole("cell", { name: sample }).first()).toBeVisible();
  }
});

test("redirige a la ruta solicitada y cierra sesión", async ({ page }) => {
  await page.goto("/vacantes");
  await page.getByLabel("Correo electrónico").fill(DEMO.email);
  await page.getByLabel("Contraseña").fill(DEMO.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/vacantes$/);

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("aplica cabeceras de seguridad", async ({ request }) => {
  const res = await request.get("/login");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});
