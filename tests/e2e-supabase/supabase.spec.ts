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
  // Las tres requisiciones del seed (otras pruebas pueden agregar requisiciones ficticias).
  for (const title of ["Ejecutivo(a) de ventas", "Analista de inventarios", "Recepcionista bilingüe"]) {
    await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Nueva requisición" })).toBeVisible();
  // Los clientes del seed son visibles (otras pruebas pueden agregar clientes ficticios).
  await page.goto("/clientes?q=Ficticia");
  await expect(page.getByRole("link", { name: "Comercializadora Ficticia del Valle S.A." })).toBeVisible();
  await page.goto("/clientes?q=Imaginaria");
  await expect(rowCount(page)).toHaveCount(1);
});

test("reclutador: solo lo asignado (RLS) y sin alta de requisiciones", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto("/requisiciones");
  // Ve la requisición del seed que tiene asignada y NO las ajenas (otras pruebas pueden asignarle más).
  await expect(page.getByRole("link", { name: "Ejecutivo(a) de ventas", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Analista de inventarios", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Recepcionista bilingüe", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Nueva requisición" })).toHaveCount(0);
  await page.goto("/postulaciones?vacante=33333333-0000-4000-8000-000000000001");
  await expect(page.getByRole("link", { name: "Carlos Ficticio Rojas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Esteban Simulado Jiménez" })).toBeVisible();
  await page.goto("/candidatos");
  await expect(page.getByRole("link", { name: "Nuevo candidato" })).toBeVisible();
});

test("consulta: solo lectura", async ({ page }) => {
  await loginAs(page, "consulta");
  for (const path of ["/clientes", "/requisiciones", "/vacantes", "/candidatos", "/postulaciones"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: /^Nuev[oa]/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Nuev[oa]/ })).toHaveCount(0);
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
