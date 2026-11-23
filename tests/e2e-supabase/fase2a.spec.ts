import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, USERS, env, type UserKey } from "./fixtures";

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString().slice(-6);
const CLIENT = `Empresa Ficticia E2E ${RUN}`;
const LEGAL_ID = `3101${RUN}`; // 10 dígitos → se normaliza a 3-101-XXXXXX

async function loginAs(page: Page, user: UserKey) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(USERS[user].email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("admin: crea, busca, edita y desactiva un cliente", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/clientes");
  await page.getByRole("link", { name: "Nuevo cliente" }).click();
  await page.getByLabel("Nombre de la empresa").fill(CLIENT);
  await page.getByLabel("Cédula jurídica").fill(LEGAL_ID);
  await page.getByLabel("Industria").fill("Manufactura ficticia");
  await page.getByLabel("Estado").selectOption("prospecto");
  await page.getByLabel("Correo del contacto").fill(" Contacto@Ficticia.TEST ");
  await page.getByLabel("Teléfono del contacto").fill("22223333");
  await page.getByLabel("Provincia").selectOption("Cartago");
  await page.getByRole("button", { name: "Crear cliente" }).click();

  await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}\?ok=creado$/);
  await expect(page.getByText("Registro creado correctamente.")).toBeVisible();
  await expect(page.getByText(`3-101-${RUN}`)).toBeVisible();
  await expect(page.getByText("contacto@ficticia.test")).toBeVisible();
  await expect(page.getByText("+506 2222-3333")).toBeVisible();

  await page.goto(`/clientes?q=${RUN}`);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("link", { name: CLIENT }).click();

  await page.getByRole("link", { name: "Editar" }).click();
  await page.getByLabel("Estado").selectOption("activo");
  await page.getByLabel("Industria").fill("Manufactura editada");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados correctamente.")).toBeVisible();
  await expect(page.getByText("Manufactura editada").first()).toBeVisible();

  await page.getByRole("button", { name: "Desactivar cliente" }).click();
  await expect(page.getByText("Registro desactivado.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reactivar cliente" })).toBeVisible();

  await page.goto(`/clientes?q=${RUN}&estado=inactivo`);
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("cédula jurídica duplicada: mensaje claro", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/clientes/nuevo");
  await page.getByLabel("Nombre de la empresa").fill(`${CLIENT} duplicado`);
  await page.getByLabel("Cédula jurídica").fill(`3-101-${RUN}`);
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Ya existe un cliente con esa cédula jurídica." })).toBeVisible();
  await expect(page.getByLabel("Nombre de la empresa")).toHaveValue(`${CLIENT} duplicado`);
});

test("coordinador: configura proceso propio del cliente y requisitos", async ({ page }) => {
  await loginAs(page, "coordinador");
  await page.goto(`/clientes?q=${RUN}`);
  await page.getByRole("link", { name: CLIENT }).click();
  await page.getByRole("link", { name: "Configuración" }).click();
  await expect(page.getByText("Este cliente usa el proceso estándar TPC.")).toBeVisible();

  await page.getByLabel("Nombre de la etapa 1").fill("Recibido por TPC");
  await page.getByRole("button", { name: "Quitar etapa 5" }).click();
  await page.getByRole("button", { name: "Guardar proceso" }).click();
  await expect(page.getByText("Proceso guardado correctamente.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Proceso propio de este cliente.")).toBeVisible();
  await expect(page.getByLabel("Nombre de la etapa 1")).toHaveValue("Recibido por TPC");
  await expect(page.getByLabel("Nombre de la etapa 8")).toHaveCount(0);

  // Regla de negocio: debe existir una etapa "Descartado"
  await page.getByRole("button", { name: "Quitar etapa 7" }).click();
  await page.getByRole("button", { name: "Guardar proceso" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Descartado" })).toBeVisible();

  await page.reload();
  await page.getByLabel("Requisito").fill("Licencia de conducir B1 (ficticio)");
  await page.getByLabel("Posición (opcional)").fill("Ejecutivo de ventas");
  await page.getByLabel("Categoría", { exact: true }).selectOption("certificacion");
  await page.getByRole("button", { name: "Agregar requisito" }).click();
  await expect(page.getByText("Requisito agregado.")).toBeVisible();
  await expect(page.getByText("Licencia de conducir B1 (ficticio)")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Usar proceso estándar" }).click();
  await expect(page.getByText("Este cliente usa el proceso estándar TPC.")).toBeVisible();
});

test("reclutador: sin alta de clientes, sin administración y configuración en solo lectura", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto("/clientes");
  await expect(page.getByRole("link", { name: "Nuevo cliente" })).toHaveCount(0);
  await page.goto("/clientes/nuevo");
  await expect(page.getByRole("heading", { name: "Acceso restringido" })).toBeVisible();
  await page.goto("/administracion/usuarios");
  await expect(page.getByRole("heading", { name: "Acceso restringido" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Administración" })).toHaveCount(0);

  await page.goto("/clientes?q=Comercializadora");
  await page.getByRole("link", { name: "Comercializadora Ficticia del Valle S.A." }).click();
  await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
  await page.getByRole("link", { name: "Configuración" }).click();
  await expect(page.getByLabel("Nombre de la etapa 1")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guardar proceso" })).toHaveCount(0);
});

test("admin: gestiona roles y estado de usuarios, pero no el propio", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto(`/administracion/usuarios?q=${encodeURIComponent("rotacion.e2e")}`);
  const row = page.getByRole("form", { name: `Editar ${USERS.rotacion.name}` });
  await row.getByLabel(`Rol de ${USERS.rotacion.name}`).selectOption("reclutador");
  await row.getByRole("button", { name: "Guardar" }).click();
  await expect(row.getByText("Usuario actualizado.")).toBeVisible();

  await page.goto("/administracion/usuarios?rol=reclutador&q=rotacion");
  await expect(page.locator("tbody tr")).toHaveCount(1);

  await page.goto(`/administracion/usuarios?q=${encodeURIComponent("admin.e2e")}`);
  await expect(page.getByLabel(`Rol de ${USERS.admin.name}`)).toBeDisabled();
});

test("admin: agrega y desactiva fuentes de recepción", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/administracion/fuentes");
  await page.getByLabel("Nombre").fill(`Feria ficticia ${RUN}`);
  await page.locator("select#category").selectOption("feria_empleo");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("Fuente agregada.")).toBeVisible();
  await page.getByRole("button", { name: `Desactivar Feria ficticia ${RUN}` }).click();
  await expect(page.getByRole("button", { name: `Activar Feria ficticia ${RUN}` })).toBeVisible();
});

test("consulta: sin administración ni edición", async ({ page }) => {
  await loginAs(page, "consulta");
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Administración" })).toHaveCount(0);
  await page.goto("/administracion");
  await expect(page.getByRole("heading", { name: "Acceso restringido" })).toBeVisible();
});

test("API: el reclutador no puede alterar configuración ni roles", async ({ request }) => {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  const tokenRes = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key },
    data: { email: USERS.reclutador.email, password: PASSWORD },
  });
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const headers = { apikey: key, Authorization: `Bearer ${access_token}`, Prefer: "return=representation" };

  const channel = await request.post(`${url}/rest/v1/intake_channels`, { headers, data: { code: "x_api", name: "X", category: "otro" } });
  expect(channel.status()).toBeGreaterThanOrEqual(400);
  const template = await request.post(`${url}/rest/v1/pipeline_templates`, { headers, data: { name: "No permitido" } });
  expect(template.status()).toBeGreaterThanOrEqual(400);
  const rpc = await request.post(`${url}/rest/v1/rpc/save_pipeline_stages`, { headers, data: { p_template_id: "00000000-0000-4000-8000-000000000000", p_stages: [] } });
  expect(rpc.status()).toBeGreaterThanOrEqual(400);
});

test("ruta de salud con Supabase", async ({ request }) => {
  const res = await request.get("/api/salud");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ estado: "ok", supabase: "ok" });
});
