import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD, USERS, env, totp, type UserKey } from "./fixtures";

/** Puerta S1: verificación en dos pasos, exigencia, bitácora y cierre por inactividad. */
const secrets: Partial<Record<UserKey, string>> = {};

async function signIn(page: Page, user: UserKey, expected: RegExp = /\/dashboard$/) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(USERS[user].email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(expected);
}

/** Configura la aplicación autenticadora del usuario desde «Mi seguridad». */
async function enroll(page: Page, user: UserKey) {
  await page.goto("/cuenta/seguridad");
  await expect(page.getByText("No configurada")).toBeVisible();
  await page.getByRole("button", { name: "Comenzar" }).click();
  await expect(page.getByAltText("Código QR para la aplicación autenticadora")).toBeVisible();
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  secrets[user] = secret;
  await page.getByLabel("Código de 6 dígitos").fill(await totp(secret));
  await page.getByRole("button", { name: "Activar" }).click();
  // La página se actualiza con lo almacenado en Supabase Auth
  await expect(page.getByText("Activada", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Eliminar / })).toBeVisible();
}

/** Restablece la exigencia (clave de servicio del stack LOCAL, solo en pruebas). */
async function resetRequirement(request: APIRequestContext) {
  const key = env("SUPABASE_SECRET_KEY");
  const res = await request.patch(`${env("SUPABASE_URL")}/rest/v1/security_settings?singleton=eq.true`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    data: { mfa_required: false },
  });
  expect(res.ok()).toBe(true);
}

test.afterAll(async ({ request }) => resetRequirement(request));

test("verificación en dos pasos: configuración y código al iniciar sesión", async ({ page }) => {
  await signIn(page, "mfa");
  await expect(page).toHaveURL(/\/dashboard$/);
  await enroll(page, "mfa");

  // Nuevo inicio de sesión: se exige el código antes de ver cualquier dato
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, "mfa", /\/login\/verificacion/);
  await page.goto("/clientes");
  await expect(page).toHaveURL(/\/login\/verificacion/);
  await page.getByLabel("Código de 6 dígitos").fill("000000");
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByText("Código incorrecto o vencido.")).toBeVisible();
  await page.getByLabel("Código de 6 dígitos").fill(await totp(secrets.mfa!));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL(/\/clientes$/);
  await expect(page.getByRole("heading", { level: 1, name: "Clientes" })).toBeVisible();
});

test("administración: exige la verificación y bloquea a quien no la tiene", async ({ page, browser, request }) => {
  await signIn(page, "adminmfa");
  await expect(page).toHaveURL(/\/dashboard$/);
  // Sin aal2 no puede activarla
  await page.goto("/administracion/seguridad");
  await expect(page.getByText("Para cambiar esta opción, primero")).toBeVisible();
  await enroll(page, "adminmfa");

  await page.goto("/administracion/seguridad");
  await expect(page.getByRole("row", { name: new RegExp(USERS.adminmfa.name) }).getByText("Configurada")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(USERS.coordinador.name) }).getByText("Pendiente")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Exigir a todos los usuarios" }).click();
  await expect(page.getByText("Verificación en dos pasos obligatoria:", { exact: false })).toBeVisible();
  await expect(page.getByText("Obligatoria", { exact: true })).toBeVisible();

  // Datos reales: exige confirmación escrita y consentimiento con aprobación jurídica (no se habilita en pruebas)
  const real = page.getByRole("form", { name: "Datos reales" });
  await real.getByRole("button", { name: "Habilitar datos reales" }).click();
  await expect(real.getByText("Escriba «HABILITAR DATOS REALES» para confirmar.")).toBeVisible();
  await real.getByLabel(/Escriba/).fill("HABILITAR DATOS REALES");
  await real.getByRole("button", { name: "Habilitar datos reales" }).click();
  await expect(real.getByText(/no tiene aprobación jurídica/)).toBeVisible();
  await expect(page.getByText("Solo ficticios", { exact: true })).toBeVisible();

  // Coordinación sin verificación: solo puede configurarla
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await signIn(p2, "coordinador");
  await expect(p2.getByRole("heading", { name: "Verificación en dos pasos obligatoria" })).toBeVisible();
  await expect(p2.getByRole("navigation", { name: "Navegación principal" }).getByRole("link")).toHaveCount(0);
  await p2.getByRole("link", { name: "Configurar ahora" }).click();
  await expect(p2.getByText("La verificación en dos pasos es obligatoria.")).toBeVisible();
  // La base de datos tampoco entrega datos (API con sesión aal1)
  const url = env("SUPABASE_URL");
  const k = env("SUPABASE_PUBLISHABLE_KEY");
  const tok = await request.post(`${url}/auth/v1/token?grant_type=password`, { headers: { apikey: k }, data: { email: USERS.coordinador.email, password: PASSWORD } });
  const { access_token } = (await tok.json()) as { access_token: string };
  const clients = await request.get(`${url}/rest/v1/clients?select=id`, { headers: { apikey: k, Authorization: `Bearer ${access_token}` } });
  expect(await clients.json()).toEqual([]);
  await other.close();

  // Dejar de exigir
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Dejar de exigir" }).click();
  await expect(page.getByText("La verificación en dos pasos dejó de ser obligatoria.")).toBeVisible();

  // Bitácora: los cambios de la exigencia quedaron registrados
  await page.goto("/administracion/bitacora?tipo=cambios&recurso=security_settings");
  await expect(page.getByRole("row", { name: new RegExp(`${USERS.adminmfa.name}.*Cambio.*security_settings.*mfa_required`) })).toHaveCount(2);
});

test("bitácora y registro de accesos: solo administración", async ({ page, request }) => {
  // Un acceso registrado por un reclutador (API con su sesión)
  const url = env("SUPABASE_URL");
  const k = env("SUPABASE_PUBLISHABLE_KEY");
  const tok = await request.post(`${url}/auth/v1/token?grant_type=password`, { headers: { apikey: k }, data: { email: USERS.reclutador.email, password: PASSWORD } });
  const { access_token } = (await tok.json()) as { access_token: string };
  const h = { apikey: k, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };
  const logged = await request.post(`${url}/rest/v1/rpc/log_access`, { headers: h, data: { p_action: "exportar", p_resource: "candidatos", p_reason: "Prueba ficticia S1", p_item_count: 3 } });
  expect(logged.ok()).toBe(true);
  // ...que no puede leer ni alterar
  expect(await (await request.get(`${url}/rest/v1/access_logs?select=id`, { headers: h })).json()).toEqual([]);
  expect((await request.patch(`${url}/rest/v1/access_logs?id=gt.0`, { headers: h, data: { reason: "x" } })).ok()).toBe(false);

  await signIn(page, "reclutador");
  await page.goto("/administracion/bitacora");
  await expect(page.getByText("Solo administradores consultan la bitácora.")).toBeVisible();
  await page.goto("/administracion/seguridad");
  await expect(page.getByText("Solo administradores pueden gestionar la seguridad.")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page, "admin");
  await page.goto("/administracion/bitacora?tipo=accesos");
  await expect(page.getByRole("row", { name: /Exportación.*candidatos.*Prueba ficticia S1 · 3 registro\(s\)/ }).first()).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(`${USERS.reclutador.name}.*Exportación`) }).first()).toBeVisible();
});

test("cierre de sesión por inactividad", async ({ page }) => {
  await page.clock.install();
  await signIn(page, "consulta");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.clock.fastForward("31:00");
  await expect(page).toHaveURL(/\/login\?motivo=inactividad/);
  await expect(page.getByText("Su sesión se cerró por inactividad")).toBeVisible();
  await page.goto("/clientes");
  await expect(page).toHaveURL(/\/login/);
});
