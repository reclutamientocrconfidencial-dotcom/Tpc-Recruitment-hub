import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD, USERS, env, type UserKey } from "./fixtures";

/** Fase 2B: flujo completo de requisición → aprobación → vacante → seguimiento → duplicación. */
const RUN = Date.now().toString().slice(-6);
const TITLE = `Montacarguista ficticio ${RUN}`;
const VAC_1 = "33333333-0000-4000-8000-000000000001";

async function loginAs(page: Page, user: UserKey) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(USERS[user].email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function adminRest(request: APIRequestContext) {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  const token = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key },
    data: { email: USERS.admin.email, password: PASSWORD },
  });
  const { access_token } = (await token.json()) as { access_token: string };
  return { url, headers: { apikey: key, Authorization: `Bearer ${access_token}` } };
}

test.afterAll(async ({ request }) => {
  // Limpieza de los datos ficticios de esta ejecución (el borrado solo lo permite el rol admin).
  const { url, headers } = await adminRest(request);
  const q = encodeURIComponent(`*${RUN}*`);
  await request.delete(`${url}/rest/v1/vacancies?title=like.${q}&source_vacancy_id=not.is.null`, { headers });
  await request.delete(`${url}/rest/v1/vacancies?title=like.${q}`, { headers });
  await request.delete(`${url}/rest/v1/requisitions?title=like.${q}`, { headers });
});

test("coordinación: requisición, aprobación, vacante, proceso propio, plazas y duplicación", async ({ page, request }) => {
  await loginAs(page, "coordinador");

  // 1) Requisición con cliente y puesto de los catálogos
  await page.goto("/requisiciones/nueva");
  await page.getByRole("combobox", { name: "Cliente", exact: true }).fill("Logística Imaginaria");
  await page.getByRole("option", { name: "Logística Imaginaria CR S.R.L." }).click();
  await page.getByRole("combobox", { name: "Puesto (catálogo)" }).fill(`Montacarguista E2E ${RUN}`);
  await page.getByRole("option", { name: `Nuevo puesto «Montacarguista E2E ${RUN}»` }).click();
  await page.getByLabel("Título del puesto solicitado").fill(TITLE);
  await page.getByLabel("Cantidad de plazas").fill("2");
  await page.getByLabel("Provincia").selectOption("Heredia");
  await page.getByLabel("Modalidad").selectOption("presencial");
  await page.getByLabel("Horario").fill("L-S 6:00 a 14:00");
  await page.getByLabel("Salario mínimo").fill("450000");
  await page.getByLabel("Salario máximo").fill("520000");
  await page.getByLabel("Prioridad").selectOption("alta");
  await page.getByLabel("Fecha límite").fill("2027-02-15");
  await page.getByLabel("Enviar a aprobación al guardar").check();
  await page.getByRole("button", { name: "Crear requisición" }).click();
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByText("Registro creado correctamente.")).toBeVisible();
  await expect(page.getByText(`Montacarguista E2E ${RUN}`)).toBeVisible();
  await expect(page.getByText("L-S 6:00 a 14:00")).toBeVisible();

  // 2) Aprobación (registrada por la base de datos)
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByText(`· ${USERS.coordinador.name}`)).toBeVisible();
  const requisitionUrl = page.url();

  // 3) Vacante con los datos heredados, publicada al guardar
  await page.getByRole("link", { name: "Nueva vacante" }).click();
  await expect(page.getByLabel("Título de la vacante")).toHaveValue(TITLE);
  await expect(page.getByLabel("Plazas")).toHaveValue("2");
  await page.getByLabel("Publicar (abrir) al guardar").check();
  await page.getByRole("button", { name: "Crear vacante" }).click();
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByText("0/2 cubiertas")).toBeVisible();
  await expect(page.getByText("(En proceso)")).toBeVisible(); // la requisición pasó a en proceso

  // 4) Proceso propio de la vacante
  await page.getByRole("button", { name: "Personalizar proceso" }).click();
  await expect(page.getByText("Proceso propio de esta vacante")).toBeVisible();
  await expect(page.getByRole("button", { name: "Usar proceso heredado" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Etapas del proceso de la vacante" }).getByRole("button", { name: /Guardar/ })).toBeVisible();

  // 5) Plazas cubiertas → estado «Cubierta» automático
  await page.getByLabel("Plazas cubiertas (de 2)").fill("3");
  await page.getByRole("button", { name: "Actualizar" }).click();
  await expect(page.getByText("Las plazas cubiertas no pueden superar las plazas de la vacante.")).toBeVisible();
  await page.getByLabel("Plazas cubiertas (de 2)").fill("2");
  await page.getByRole("button", { name: "Actualizar" }).click();
  await expect(page.getByText("la vacante pasó a «Cubierta»")).toBeVisible();
  await expect(page.getByText("2/2 cubiertas")).toBeVisible();

  // 6) Duplicación (borrador, sin plazas cubiertas, con el proceso propio)
  await page.getByRole("button", { name: "Duplicar" }).click();
  await expect(page.getByText("Vacante duplicada en borrador.")).toBeVisible();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("0/2 cubiertas")).toBeVisible();
  await expect(page.getByText("Proceso propio de esta vacante")).toBeVisible();
  await expect(page.getByRole("link", { name: "Vacante de origen" })).toBeVisible();
  // No se puede publicar: excedería las plazas autorizadas (aplicación y base de datos)
  await expect(page.getByTestId("plazas-disponibles")).toContainText("Plazas disponibles en la requisición: 0 de 2.");
  await page.getByRole("button", { name: "Publicar / abrir" }).click();
  await expect(page.getByText("Plazas insuficientes en la requisición: autorizadas 2, ya comprometidas en otras vacantes 2, esta vacante requiere 2.")).toBeVisible();
  await expect(page.getByText("Borrador", { exact: true }).first()).toBeVisible();
  const duplicateUrl = page.url();

  // 7) Seguimiento en la requisición y filtros
  await page.goto(requisitionUrl);
  // Escenario REQ-2026-00004: el duplicado en borrador no cuenta en el avance
  await expect(page.getByText("2 autorizadas · 2 cubiertas · 0 pendientes · 2 comprometidas en vacantes publicadas · 0 disponibles para publicar")).toBeVisible();
  await page.goto(`/requisiciones?q=${RUN}`);
  await expect(page.getByRole("row", { name: new RegExp(TITLE.replace(/[()]/g, "\\$&")) }).getByText("2/2 cubiertas")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(TITLE.replace(/[()]/g, "\\$&")) }).getByText("Completo")).toBeVisible();
  await page.goto(`/vacantes?q=${RUN}&estado=cubierta`);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.goto(`/vacantes?q=${RUN}&pendientes=1`);
  await expect(page.locator("tbody tr")).toHaveCount(1);

  // Verificación directa en la base de datos (REST con sesión: aplica RLS)
  const { url, headers } = await adminRest(request);
  const res = await request.get(`${url}/rest/v1/requisitions?select=status,approved_by,position_id&title=eq.${encodeURIComponent(TITLE)}`, { headers });
  const [req] = (await res.json()) as Array<{ status: string; approved_by: string | null; position_id: string | null }>;
  expect(req?.status).toBe("en_proceso");
  expect(req?.approved_by).not.toBeNull();
  expect(req?.position_id).not.toBeNull();

  // La base de datos aplica la misma regla aunque se omita la aplicación
  const dupId = duplicateUrl.split("/vacantes/")[1]!.split(/[/?]/)[0]!;
  const publish = await request.patch(`${url}/rest/v1/vacancies?id=eq.${dupId}`, { headers: { ...headers, "Content-Type": "application/json" }, data: { status: "abierta" } });
  expect(publish.ok()).toBe(false);
  expect(((await publish.json()) as { message: string }).message).toContain("Plazas insuficientes");
  const reduce = await request.patch(`${url}/rest/v1/requisitions?title=eq.${encodeURIComponent(TITLE)}`, { headers: { ...headers, "Content-Type": "application/json" }, data: { positions_count: 1 } });
  expect(reduce.ok()).toBe(false);
});

test("reclutador: solo seguimiento de su vacante, sin edición completa", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto(`/vacantes/${VAC_1}`);
  await expect(page.getByRole("heading", { level: 1, name: "Ejecutivo(a) de ventas corporativas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Duplicar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Personalizar proceso" })).toHaveCount(0);
  await page.getByLabel("Plazas cubiertas (de 3)").fill("1");
  await page.getByRole("button", { name: "Actualizar" }).click();
  await expect(page.getByText("Plazas cubiertas actualizadas.")).toBeVisible();
  await page.getByLabel("Plazas cubiertas (de 3)").fill("0");
  await page.getByRole("button", { name: "Actualizar" }).click();
  await expect(page.getByText("0/3 cubiertas")).toBeVisible();

  await page.goto(`/vacantes/${VAC_1}/editar`);
  await expect(page.getByText("Solo administradores y coordinadores pueden editar los datos de una vacante.")).toBeVisible();
  await page.goto("/requisiciones/nueva");
  await expect(page.getByText("Solo administradores y coordinadores pueden registrar requisiciones.")).toBeVisible();
});

test("consulta: ve requisiciones y vacantes sin acciones", async ({ page }) => {
  await loginAs(page, "consulta");
  await page.goto("/requisiciones/22222222-0000-4000-8000-000000000003");
  await expect(page.getByRole("heading", { level: 1, name: "Recepcionista bilingüe" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprobar" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
  await page.goto(`/vacantes/${VAC_1}`);
  await expect(page.getByRole("spinbutton", { name: /Plazas cubiertas/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Actualizar" })).toHaveCount(0);
});
