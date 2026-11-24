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

test("coordinador: proceso desde el catálogo con categoría y tipo automáticos", async ({ page }) => {
  await loginAs(page, "coordinador");
  await page.goto(`/clientes?q=${RUN}`);
  await page.getByRole("link", { name: CLIENT }).click();
  await page.getByRole("link", { name: "Configuración" }).click();
  await expect(page.getByText("Este cliente usa el proceso estándar TPC.")).toBeVisible();

  const general = page.getByRole("form", { name: "Etapas del proceso", exact: true });
  await general.getByLabel("Etapa 2", { exact: true }).selectOption({ label: "Prueba de Excel" });
  await expect(general.getByTestId("tipo-2")).toHaveText("Prueba");
  await general.getByRole("button", { name: "Quitar etapa 5" }).click();
  await general.getByRole("button", { name: "Guardar proceso" }).click();
  await expect(page.getByText("Proceso guardado y verificado en la base de datos.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Proceso propio de este cliente.")).toBeVisible();
  const reloaded = page.getByRole("form", { name: "Etapas del proceso", exact: true });
  await expect(reloaded.getByLabel("Etapa 2", { exact: true }).locator("option:checked")).toHaveText("Prueba de Excel");
  await expect(reloaded.getByTestId("categoria-2")).toHaveText("En proceso");
  await expect(reloaded.getByLabel("Etapa 8", { exact: true })).toHaveCount(0);

  // Regla de negocio en la BD: sin etapa "Descartado" no se guarda
  await reloaded.getByRole("button", { name: "Quitar etapa 7" }).click();
  await expect(reloaded.getByText("Falta al menos una etapa de categoría: Descartado.")).toBeVisible();
  await reloaded.getByRole("button", { name: "Guardar proceso" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "descartado" })).toBeVisible();
});

test("coordinador: crea una etapa nueva en el catálogo y la usa", async ({ page }) => {
  await loginAs(page, "coordinador");
  await page.goto(`/clientes?q=${RUN}`);
  await page.getByRole("link", { name: CLIENT }).click();
  await page.getByRole("link", { name: "Configuración" }).click();
  await page.getByText("¿No encuentra la etapa? Agréguela al catálogo").click();
  await page.getByLabel("Nombre de la etapa").fill(`Evaluación ficticia ${RUN}`);
  await page.getByLabel("Tipo", { exact: true }).first().selectOption("prueba");
  await page.getByRole("button", { name: "Agregar al catálogo" }).click();
  await expect(page.getByText(`Etapa «Evaluación ficticia ${RUN}» agregada al catálogo.`)).toBeVisible();

  const general = page.getByRole("form", { name: "Etapas del proceso", exact: true });
  await general.getByLabel("Etapa 3", { exact: true }).selectOption({ label: `Evaluación ficticia ${RUN}` });
  await expect(general.getByTestId("tipo-3")).toHaveText("Prueba");
  await general.getByRole("button", { name: "Guardar proceso" }).click();
  await expect(page.getByText("Proceso guardado y verificado en la base de datos.")).toBeVisible();
});

test("coordinador: proceso por puesto (puesto nuevo) y requisitos con nivel de dominio", async ({ page }) => {
  await loginAs(page, "coordinador");
  await page.goto(`/clientes?q=${RUN}`);
  await page.getByRole("link", { name: CLIENT }).click();
  await page.getByRole("link", { name: "Configuración" }).click();

  // Proceso para un puesto que no existe todavía en el catálogo
  const pos = page.getByRole("combobox", { name: "Puesto del proceso" });
  await pos.fill(`Montacarguista ficticio ${RUN}`);
  await page.getByRole("option", { name: `Nuevo puesto «Montacarguista ficticio ${RUN}»` }).click();
  await page.getByLabel("Copiar etapas de").selectOption({ label: "Proceso propio del cliente" });
  await page.getByRole("button", { name: "Crear proceso del puesto" }).click();
  await expect(page.getByText("Proceso del puesto creado.")).toBeVisible();
  await expect(page.getByText(`Montacarguista ficticio ${RUN}`).first()).toBeVisible();

  // Requisito del catálogo con nivel B2 para un puesto existente
  const req = page.getByRole("combobox", { name: "Requisito" });
  await req.fill("Ingl");
  await page.getByRole("option", { name: /^Inglés/ }).click();
  await page.getByLabel("Nivel mínimo").selectOption("B2");
  await page.getByRole("combobox", { name: "Puesto", exact: true }).fill("Recepcionista");
  await page.getByRole("option", { name: /Recepcionista bilingüe/ }).click();
  await page.getByRole("button", { name: "Agregar requisito" }).click();
  await expect(page.getByText("Requisito agregado.")).toBeVisible();
  await expect(page.getByText("Nivel mínimo: B2")).toBeVisible();

  // Requisito nuevo escrito libremente → se agrega al catálogo
  await req.fill(`Power BI ficticio ${RUN}`);
  await page.getByRole("option", { name: `Nuevo requisito «Power BI ficticio ${RUN}»` }).click();
  await expect(page.getByLabel("Categoría del nuevo requisito")).toHaveValue("habilidad");
  await page.getByRole("button", { name: "Agregar requisito" }).click();
  await expect(page.getByText(`Power BI ficticio ${RUN}`, { exact: true })).toBeVisible();

  await page.goto("/administracion/catalogos/requisitos");
  await expect(page.getByRole("row", { name: new RegExp(`Power BI ficticio ${RUN} Habilidad Sin escala`) })).toBeVisible();
});

test("coordinador: copia la configuración a otro cliente sin duplicar", async ({ page }) => {
  await loginAs(page, "coordinador");
  await page.goto("/clientes?q=Imaginaria");
  await page.getByRole("link", { name: "Logística Imaginaria CR S.R.L." }).click();
  await page.getByRole("link", { name: "Configuración" }).click();
  await page.getByLabel("Cliente de origen").selectOption({ label: CLIENT });
  await page.getByRole("button", { name: "Copiar configuración" }).click();
  await expect(page.getByText(/proceso\(s\) copiado\(s\)/)).toBeVisible();
  await expect(page.getByText("Proceso propio de este cliente.")).toBeVisible();
  await expect(page.getByText("Nivel mínimo: B2")).toBeVisible();

  await page.getByLabel("Cliente de origen").selectOption({ label: CLIENT });
  await page.getByRole("button", { name: "Copiar configuración" }).click();
  await expect(page.getByText(/omitido\(s\) porque ya existían.*0 requisito\(s\) copiado\(s\)/)).toBeVisible();
});

test("admin: desactiva un puesto sin perder historial y deja de ofrecerse", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/administracion/catalogos/puestos?q=Misceláneo");
  await page.getByRole("button", { name: "Desactivar puesto Misceláneo(a)" }).click();
  await expect(page.getByRole("button", { name: "Activar puesto Misceláneo(a)" })).toBeVisible();
  await page.goto("/administracion/procesos");
  const pos = page.getByRole("combobox", { name: "Puesto del proceso" });
  await pos.fill("Miscel");
  await expect(page.getByRole("option", { name: /^Misceláneo\(a\)/ })).toHaveCount(0);
  await page.goto("/administracion/catalogos/puestos?q=Misceláneo");
  await page.getByRole("button", { name: "Activar puesto Misceláneo(a)" }).click();
  await expect(page.getByRole("button", { name: "Desactivar puesto Misceláneo(a)" })).toBeVisible();
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
  await expect(page.getByLabel("Etapa 1", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Agregar al catálogo" })).toHaveCount(0);
  await page.goto("/administracion/catalogos");
  await expect(page.getByRole("heading", { name: "Acceso restringido" })).toBeVisible();
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
  const stage = await request.post(`${url}/rest/v1/stage_catalog`, { headers, data: { name: "Etapa API", category: "en_proceso" } });
  expect(stage.status()).toBeGreaterThanOrEqual(400);
  const dup = await request.post(`${url}/rest/v1/rpc/duplicate_pipeline_template`, { headers, data: { p_source_id: "00000000-0000-4000-8000-000000000000" } });
  expect(dup.status()).toBeGreaterThanOrEqual(400);
  const del = await request.delete(`${url}/rest/v1/job_positions?name=eq.Chofer`, { headers });
  expect(del.status()).toBeGreaterThanOrEqual(400);
  const rpc = await request.post(`${url}/rest/v1/rpc/save_pipeline_stages`, { headers, data: { p_template_id: "00000000-0000-4000-8000-000000000000", p_stages: [] } });
  expect(rpc.status()).toBeGreaterThanOrEqual(400);
});

test("ruta de salud con Supabase", async ({ request }) => {
  const res = await request.get("/api/salud");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ estado: "ok", supabase: "ok" });
});
