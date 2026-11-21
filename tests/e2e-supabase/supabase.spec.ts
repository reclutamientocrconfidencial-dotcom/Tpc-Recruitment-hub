import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, USERS, env, type UserKey } from "./fixtures";

async function loginAs(page: Page, user: UserKey) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(USERS[user].email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const rowCount = (page: Page) => page.locator("tbody tr");

test("sin modo demostración ni credenciales demo", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Modo demostración")).toHaveCount(0);
  await page.getByLabel("Correo electrónico").fill("demo@tpc-demo.test");
  await page.getByLabel("Contraseña").fill("DemoTPC2026");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Correo o contraseña incorrectos." })).toBeVisible();
});

test("contraseña incorrecta: mensaje genérico", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(USERS.admin.email);
  await page.getByLabel("Contraseña").fill("Incorrecta-123");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Correo o contraseña incorrectos." })).toBeVisible();
});

test("admin: ve todo y puede crear", async ({ page }) => {
  await loginAs(page, "admin");
  await expect(page.getByText("Administrador")).toBeVisible();
  await page.goto("/requisiciones");
  await expect(rowCount(page)).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Nueva requisición" })).toBeVisible();
  await page.goto("/clientes");
  await expect(rowCount(page)).toHaveCount(3);
});

test("reclutador: solo lo asignado (RLS) y sin alta de requisiciones", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto("/requisiciones");
  await expect(rowCount(page)).toHaveCount(1);
  await expect(page.getByRole("cell", { name: "Ejecutivo(a) de ventas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nueva requisición" })).toHaveCount(0);
  await page.goto("/postulaciones");
  await expect(rowCount(page)).toHaveCount(2);
  await page.goto("/candidatos");
  await expect(page.getByRole("button", { name: "Nuevo candidato" })).toBeVisible();
});

test("consulta: solo lectura", async ({ page }) => {
  await loginAs(page, "consulta");
  for (const path of ["/clientes", "/requisiciones", "/vacantes", "/candidatos", "/postulaciones"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: /^Nuev[oa]/ })).toHaveCount(0);
  }
});

test("usuario inactivo: sin acceso a datos", async ({ page }) => {
  await loginAs(page, "inactivo");
  await expect(page.getByRole("heading", { name: "Cuenta pendiente de activación" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link")).toHaveCount(0);
});

test("cierre de sesión invalida el acceso", async ({ page }) => {
  await loginAs(page, "admin");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/candidatos");
  await expect(page).toHaveURL(/\/login\?next=%2Fcandidatos$/);
});

test("API pública: anónimos sin datos y registro deshabilitado", async ({ request }) => {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  const headers = { apikey: key };
  for (const table of ["candidates", "clients", "profiles", "applications", "audit_logs", "dashboard_metrics"]) {
    const res = await request.get(`${url}/rest/v1/${table}?select=*`, { headers });
    expect(res.status(), `anon en ${table}`).toBeGreaterThanOrEqual(400);
  }
  const rpc = await request.post(`${url}/rest/v1/rpc/has_any_role`, { headers, data: {} });
  expect(rpc.status()).toBeGreaterThanOrEqual(400);
  const signup = await request.post(`${url}/auth/v1/signup`, {
    headers,
    data: { email: "intruso@tpc-demo.test", password: "Ficticia-2026!" },
  });
  expect(signup.status()).toBeGreaterThanOrEqual(400);
});

test("API con sesión de reclutador: RLS impide escalar privilegios", async ({ request }) => {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  const tokenRes = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key },
    data: { email: USERS.reclutador.email, password: PASSWORD },
  });
  const { access_token, user } = (await tokenRes.json()) as { access_token: string; user: { id: string } };
  const headers = { apikey: key, Authorization: `Bearer ${access_token}`, Prefer: "return=representation" };

  const escalate = await request.patch(`${url}/rest/v1/profiles?id=eq.${user.id}`, { headers, data: { role: "admin" } });
  expect(escalate.status()).toBeGreaterThanOrEqual(400);

  const createClient = await request.post(`${url}/rest/v1/clients`, { headers, data: { name: "Cliente Prohibido Ficticio" } });
  expect(createClient.status()).toBeGreaterThanOrEqual(400);

  const audit = await request.get(`${url}/rest/v1/audit_logs?select=id`, { headers });
  expect(await audit.json()).toEqual([]);
});
