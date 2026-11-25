import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD, USERS, env } from "./fixtures";

/**
 * Regresión (reportada en TEST): en un proceso por puesto, sustituir una etapa
 * por otra recién creada en el catálogo debe conservarse tras guardar y recargar,
 * y lo mostrado debe coincidir con lo realmente almacenado en la base de datos.
 */
const RUN = Date.now().toString().slice(-6);

async function loginAs(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(USERS.admin.email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Etapas almacenadas (consulta REST con la sesión del admin: aplica RLS). */
async function storedStages(request: APIRequestContext, positionName: string, clientId: string | null) {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  const token = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key },
    data: { email: USERS.admin.email, password: PASSWORD },
  });
  const { access_token } = (await token.json()) as { access_token: string };
  const headers = { apikey: key, Authorization: `Bearer ${access_token}` };
  const scope = clientId ? `client_id=eq.${clientId}` : "client_id=is.null";
  const res = await request.get(
    `${url}/rest/v1/pipeline_templates?select=id,position:job_positions!inner(name),stages:pipeline_stages(position,name)&is_default=eq.true&${scope}&position.name=eq.${encodeURIComponent(positionName)}`,
    { headers },
  );
  expect(res.ok()).toBe(true);
  const rows = (await res.json()) as Array<{ stages: Array<{ position: number; name: string }> }>;
  expect(rows).toHaveLength(1); // exactamente un proceso para ese alcance
  return rows[0]!.stages.sort((a, b) => a.position - b.position).map((s) => s.name);
}

async function replaceStageAndVerify(page: Page, request: APIRequestContext, opts: { path: string; position: string; stage: string; clientId: string | null }) {
  const { path, position, stage, clientId } = opts;
  await page.goto(path);

  // 1) Proceso del puesto a partir del estándar TPC
  await page.getByRole("combobox", { name: "Puesto del proceso" }).fill(position);
  await page.getByRole("option", { name: `Nuevo puesto «${position}»` }).click();
  await page.getByLabel("Copiar etapas de").selectOption({ label: "Proceso estándar TPC" });
  await page.getByRole("button", { name: "Crear proceso del puesto" }).click();
  await expect(page.getByText("Proceso del puesto creado.")).toBeVisible();

  // 2) Etapa nueva en el catálogo
  await page.getByText("¿No encuentra la etapa? Agréguela al catálogo").click();
  await page.getByLabel("Nombre de la etapa").fill(stage);
  await page.getByLabel("Tipo", { exact: true }).first().selectOption("prueba");
  await page.getByRole("button", { name: "Agregar al catálogo" }).click();
  await expect(page.getByText(`Etapa «${stage}» agregada al catálogo.`)).toBeVisible();

  // 3) Sustituir "Prueba técnica" por la nueva etapa en el proceso del puesto
  await page.locator("summary", { hasText: position }).click();
  const editor = page.getByRole("form", { name: `Etapas del proceso de ${position}` });
  const row4 = editor.getByLabel("Etapa 4", { exact: true });
  await expect(row4.locator("option:checked")).toHaveText("Prueba técnica");
  await row4.selectOption({ label: stage });
  await editor.getByRole("button", { name: `Guardar proceso de ${position}` }).click();
  await expect(editor.getByText("Proceso guardado y verificado en la base de datos.")).toBeVisible();

  // 4) Pantalla = base de datos inmediatamente después de guardar
  await expect(editor.getByLabel("Etapa 4", { exact: true }).locator("option:checked")).toHaveText(stage);
  const stored = await storedStages(request, position, clientId);
  expect(stored[3]).toBe(stage);
  expect(stored).not.toContain("Prueba técnica");

  // 5) Tras recargar: todas las etapas seleccionadas y la sustitución conservada
  await page.reload();
  await page.locator("summary", { hasText: position }).click();
  const reloaded = page.getByRole("form", { name: `Etapas del proceso de ${position}` });
  for (let i = 1; i <= stored.length; i++) {
    await expect(reloaded.getByLabel(`Etapa ${i}`, { exact: true }).locator("option:checked")).toHaveText(stored[i - 1]!);
  }
  await expect(reloaded.getByTestId("tipo-4")).toHaveText("Prueba");

  // 6) Segundo guardado sin cambios y nueva recarga: sigue igual
  await reloaded.getByRole("button", { name: `Guardar proceso de ${position}` }).click();
  await expect(reloaded.getByText("Proceso guardado y verificado en la base de datos.")).toBeVisible();
  await page.reload();
  await page.locator("summary", { hasText: position }).click();
  await expect(
    page.getByRole("form", { name: `Etapas del proceso de ${position}` }).getByLabel("Etapa 4", { exact: true }).locator("option:checked"),
  ).toHaveText(stage);
  expect((await storedStages(request, position, clientId))[3]).toBe(stage);
}

test.describe.configure({ mode: "serial" });

test("proceso por puesto global: la etapa sustituida se guarda, coincide con la BD y se conserva", async ({ page, request }) => {
  await loginAs(page);
  await replaceStageAndVerify(page, request, {
    path: "/administracion/procesos",
    position: `Capacitador(a) de Campo ficticio ${RUN}`,
    stage: `Prueba de campo ficticia ${RUN}`,
    clientId: null,
  });
  // El proceso estándar no se modificó
  const standard = page.getByRole("form", { name: "Etapas del proceso", exact: true });
  await expect(standard.getByLabel("Etapa 4", { exact: true }).locator("option:checked")).toHaveText("Prueba técnica");
});

test("proceso por puesto de un cliente: misma verificación en la configuración del cliente", async ({ page, request }) => {
  const CLIENT_ID = "11111111-0000-4000-8000-000000000003"; // Servicios Demo Guanacaste (seed ficticio)
  await loginAs(page);
  await replaceStageAndVerify(page, request, {
    path: `/clientes/${CLIENT_ID}/configuracion`,
    position: `Capacitador de campo cliente ficticio ${RUN}`,
    stage: `Prueba de campo cliente ficticia ${RUN}`,
    clientId: CLIENT_ID,
  });
});
