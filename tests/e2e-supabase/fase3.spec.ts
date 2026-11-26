import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD, USERS, env, type UserKey } from "./fixtures";

/**
 * Fase 3: formulario público por vacante, preguntas de preselección, enlace y QR por
 * canal, consentimiento digital, currículum en almacenamiento privado, incorporación
 * automática, detección de duplicados con revisión humana y permisos por rol.
 * Todos los datos son ficticios (correos *.test).
 */
const RUN = Date.now().toString().slice(-6);
const VAC = `Vacante Formulario ${RUN}`;
const PDF = Buffer.from(`%PDF-1.4\n% Curriculum ficticio de pruebas ${RUN}\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n`);

async function loginAs(page: Page, user: UserKey) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(USERS[user].email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function api(request: APIRequestContext, user: UserKey) {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  const tok = await request.post(`${url}/auth/v1/token?grant_type=password`, { headers: { apikey: key }, data: { email: USERS[user].email, password: PASSWORD } });
  const { access_token, user: u } = (await tok.json()) as { access_token: string; user: { id: string } };
  const headers = { apikey: key, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", Prefer: "return=representation" };
  return {
    userId: u.id,
    rest: `${url}/rest/v1`,
    headers,
    async post<T>(path: string, data: unknown): Promise<T> {
      const r = await request.post(`${url}/rest/v1/${path}`, { headers, data });
      expect(r.ok(), `${path}: ${await r.text()}`).toBe(true);
      return (await r.json()) as T;
    },
  };
}

/** Llena el formulario público como lo haría una persona (respeta el tiempo mínimo anti-robots). */
async function fillPublicForm(page: Page, p: { first: string; last: string; email: string; licencia: "Sí" | "No"; years: string; cv?: Buffer | null; cvName?: string }) {
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill(p.first);
  await page.getByLabel("Apellidos").fill(p.last);
  await page.getByLabel("Correo electrónico").fill(p.email);
  await page.getByLabel("Teléfono").fill(`8${RUN}9`);  // único por ejecución (evita coincidencias con corridas previas)
  await page.getByLabel("Provincia").selectOption("Heredia");
  await page.getByLabel("Cantón").selectOption("Belén");
  await page.getByRole("group", { name: /licencia B1/ }).getByLabel(p.licencia).check();
  await page.getByLabel("Años de experiencia en ventas").fill(p.years);
  if (p.cv) await page.getByLabel(/Adjunte su currículum/).setInputFiles({ name: p.cvName ?? "cv.pdf", mimeType: "application/pdf", buffer: p.cv });
  await page.getByLabel(/He leído y acepto el consentimiento/).check();
  await page.waitForTimeout(3_200);
  await page.getByRole("button", { name: "Enviar postulación" }).click();
}

test.describe.configure({ mode: "serial" });

let vacancyId = "";
let publicPath = "";

test.beforeAll(async ({ request }) => {
  const coord = await api(request, "coordinador");
  const recruiter = await api(request, "reclutador");
  const [req] = await coord.post<Array<{ id: string }>>("requisitions", { client_id: "11111111-0000-4000-8000-000000000002", title: `Requisición Formulario ${RUN}`, positions_count: 2, status: "pendiente_aprobacion" });
  const ok = await request.patch(`${coord.rest}/requisitions?id=eq.${req!.id}`, { headers: coord.headers, data: { status: "aprobada" } });
  expect(ok.ok()).toBe(true);
  const [vac] = await coord.post<Array<{ id: string }>>("vacancies", { requisition_id: req!.id, title: VAC, openings: 2, status: "abierta", recruiter_id: recruiter.userId });
  vacancyId = vac!.id;
});

test("coordinación configura formulario, preguntas, enlace por canal y código QR", async ({ page }) => {
  await loginAs(page, "coordinador");
  await page.goto("/recepcion/formularios");
  const form = page.getByRole("form", { name: "Nuevo formulario" });
  await form.getByLabel("Vacante").selectOption(vacancyId);
  await form.getByLabel("Título visible para el público").fill(`Postúlese ${RUN}`);
  await form.getByRole("button", { name: "Crear formulario" }).click();
  await expect(page).toHaveURL(/\/recepcion\/formularios\/[0-9a-f-]{36}\?ok=creado$/);

  const q = page.getByRole("form", { name: "Nueva pregunta" });
  await q.getByLabel("Pregunta").fill("¿Cuenta con licencia B1 vigente?");
  await q.getByLabel("Criterio eliminatorio").selectOption("si");
  await q.getByRole("button", { name: "Agregar pregunta" }).click();
  await expect(page.getByText("1. ¿Cuenta con licencia B1 vigente?")).toBeVisible();
  await q.getByLabel("Pregunta").fill("Años de experiencia en ventas");
  await q.getByLabel("Tipo de respuesta").selectOption("numero");
  await q.getByLabel("Mínimo que cumple (opcional)").fill("2");
  await q.getByRole("button", { name: "Agregar pregunta" }).click();
  await expect(page.getByText("2. Años de experiencia en ventas")).toBeVisible();

  const l = page.getByRole("form", { name: "Nuevo enlace" });
  await l.getByLabel("Canal de recepción").selectOption({ index: 1 });
  await l.getByLabel("Detalle (opcional)").fill(`Feria E2E ${RUN}`);
  await l.getByRole("button", { name: "Crear enlace y código QR" }).click();
  const link = page.getByTestId("public-link").first();
  await expect(link).toContainText("/p/");
  await expect(page.getByRole("img", { name: new RegExp(`Código QR: .*Feria E2E ${RUN}`) })).toBeVisible();
  publicPath = new URL((await link.textContent())!.trim()).pathname;
});

test("público: valida datos y archivo, y la postulación sin duplicados se incorpora sola", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(publicPath);
  await expect(page.getByRole("heading", { name: `Postúlese ${RUN}` })).toBeVisible();
  // Sin consentimiento ni datos: errores en español, sin perder lo escrito
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Ximena");
  await page.waitForTimeout(3_200);
  await page.getByRole("button", { name: "Enviar postulación" }).click();
  await expect(page.getByText("Revise los campos marcados.")).toBeVisible();
  await expect(page.getByText("Debe aceptar el consentimiento informado para enviar su postulación.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Nombre", exact: true })).toHaveValue("Ximena");
  // Archivo disfrazado de PDF: rechazado por su contenido real
  await page.reload();
  await fillPublicForm(page, { first: "Ximena", last: `Formulario ${RUN}`, email: `ximena.${RUN}@correo.test`, licencia: "Sí", years: "3", cv: Buffer.from("MZ ejecutable disfrazado"), cvName: "cv.pdf" });
  await expect(page.getByText("Solo se aceptan currículums en PDF o Word (.docx).")).toBeVisible();
  // Puerta S1: sin datos reales habilitados, la BD solo acepta correos ficticios
  await page.reload();
  await fillPublicForm(page, { first: "Ximena", last: `Formulario ${RUN}`, email: `ximena.${RUN}@gmail.com`, licencia: "Sí", years: "3", cv: PDF });
  await expect(page.getByText("Ambiente de pruebas: use un correo ficticio terminado en .test")).toBeVisible();
  // Envío válido con currículum PDF
  await page.reload();
  await fillPublicForm(page, { first: "Ximena", last: `Formulario ${RUN}`, email: `ximena.${RUN}@correo.test`, licencia: "Sí", years: "3", cv: PDF });
  await expect(page.getByRole("heading", { name: "¡Gracias! Recibimos su postulación" })).toBeVisible();
  await expect(page.getByText("No pudimos recibir su currículum")).toHaveCount(0);
  await ctx.close();
});

test("ficha: canal de recepción, consentimiento digital y descarga registrada del currículum", async ({ page, request }) => {
  await loginAs(page, "coordinador");
  await page.goto(`/candidatos?q=${encodeURIComponent(`Ximena Formulario ${RUN}`)}`);
  await page.getByRole("link", { name: `Ximena Formulario ${RUN}` }).click();
  await expect(page.getByText(`Feria E2E ${RUN}`)).toBeVisible();
  await expect(page.getByText(/Formulario web «Postúlese/)).toBeVisible();
  await expect(page.getByText("Recibido por formulario público")).toBeVisible();
  const href = await page.getByRole("link", { name: "Descargar" }).first().getAttribute("href");
  const res = await page.request.get(href!, { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  const signed = res.headers()["location"]!;
  expect(signed).toMatch(/\/storage\/v1\/object\/sign\/curriculums\/envios\//);
  const file = await page.request.get(signed);
  expect(file.ok()).toBe(true);
  expect((await file.body()).subarray(0, 5).toString()).toBe("%PDF-");
  // La descarga quedó en el registro de accesos (lo consulta administración)
  const candidateId = new URL(page.url()).pathname.split("/").pop();
  const admin = await api(request, "admin");
  const logs = await request.get(`${admin.rest}/access_logs?select=action,resource&action=eq.descargar&resource=eq.curriculum&record_id=eq.${candidateId}`, { headers: admin.headers });
  expect(((await logs.json()) as unknown[]).length).toBeGreaterThanOrEqual(1);
  // El personal carga otro currículum (Word) desde la ficha; un archivo inválido se rechaza
  const upload = page.getByRole("form", { name: "Cargar currículum" });
  await upload.getByLabel(/Cargar currículum/).setInputFiles({ name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("texto plano") });
  await upload.getByRole("button", { name: "Cargar", exact: true }).click();
  await expect(upload.getByText("Solo se aceptan currículums en PDF o Word (.docx).")).toBeVisible();
  const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`....[Content_Types].xml....word/document.xml ${RUN}`)]);
  await upload.getByLabel(/Cargar currículum/).setInputFiles({ name: `CV actualizado ${RUN}.docx`, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docx });
  await upload.getByRole("button", { name: "Cargar", exact: true }).click();
  await expect(page.getByText(`CV actualizado ${RUN}.docx`)).toBeVisible();
  // La postulación quedó en la vacante con su canal
  await page.goto(`/vacantes/${vacancyId}/postulaciones`);
  await expect(page.getByRole("region", { name: "Tablero de postulaciones" }).getByRole("link", { name: `Ximena Formulario ${RUN}` })).toBeVisible();
});

test("duplicado: queda en revisión y el reclutador asignado lo vincula a la ficha existente", async ({ browser, page }) => {
  const ctx = await browser.newContext();
  const pub = await ctx.newPage();
  await pub.goto(publicPath);
  await fillPublicForm(pub, { first: "Ximena María", last: `Duplicada ${RUN}`, email: `XIMENA.${RUN}@correo.test`, licencia: "No", years: "1", cv: PDF });
  await expect(pub.getByRole("heading", { name: "¡Gracias! Recibimos su postulación" })).toBeVisible();
  await ctx.close();

  await loginAs(page, "reclutador");
  await page.goto("/recepcion");
  const row = page.getByRole("row", { name: new RegExp(`Ximena María Duplicada ${RUN}`) });
  await expect(row).toContainText("Por revisar");
  await expect(row).toContainText("No cumple");
  await row.getByRole("link").first().click();
  await expect(page.getByText(/Coincide por/)).toContainText("correo");
  await page.getByRole("radio", { name: /Es la misma persona/ }).check();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Vinculado a candidato existente")).toBeVisible();
  await expect(page.getByText("Ya se trasladaron a la ficha del candidato o se eliminaron.")).toBeVisible();
  await page.getByRole("link", { name: "Abrir la ficha del candidato" }).click();
  await expect(page.getByRole("heading", { name: `Ximena Formulario ${RUN}` })).toBeVisible();
  // Dos currículums recibidos y dos consentimientos por formulario web
  await expect(page.getByText("Recibido por formulario público")).toHaveCount(2);
});

test("descartar: elimina los datos personales y el currículum del envío", async ({ browser, page }) => {
  const ctx = await browser.newContext();
  const pub = await ctx.newPage();
  await pub.goto(publicPath);
  await fillPublicForm(pub, { first: "Ximena", last: `Formulario ${RUN}`, email: `otra.${RUN}@correo.test`, licencia: "Sí", years: "4", cv: PDF });
  await expect(pub.getByRole("heading", { name: "¡Gracias! Recibimos su postulación" })).toBeVisible();
  await ctx.close();

  await loginAs(page, "coordinador");
  await page.goto("/recepcion");
  await page.getByRole("row", { name: new RegExp(`Ximena Formulario ${RUN}`) }).getByRole("link").first().click();
  await expect(page.getByText(/Coincide por/)).toContainText("nombre");
  const submissionId = new URL(page.url()).pathname.split("/").pop()!;
  page.once("dialog", (d) => d.accept());
  await page.getByRole("radio", { name: /Descartar/ }).check();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Envío descartado: sin datos personales.")).toBeVisible();
  await expect(page.getByText("Sin currículum")).toBeVisible();
  // El archivo ya no existe en el almacenamiento privado
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });
  const { data } = await admin.storage.from("curriculums").list(`envios/${submissionId}`);
  expect(data ?? []).toHaveLength(0);
});

test("permisos: consulta no ve la bandeja; reclutador no administra formularios; el público no ve datos", async ({ page, request }) => {
  await loginAs(page, "consulta");
  await page.goto("/recepcion");
  await expect(page.getByText("La bandeja de recepción contiene datos personales y no está disponible para su rol.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Recepción" })).toHaveCount(0);
  await page.context().clearCookies();
  await loginAs(page, "reclutador");
  await page.goto("/recepcion/formularios");
  await expect(page.getByText("Solo administración y coordinación gestionan los formularios públicos.")).toBeVisible();
  // API anónima: sin acceso a tablas ni envíos sin la clave del servidor
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  const anon = { apikey: key, "Content-Type": "application/json" };
  const list = await request.get(`${url}/rest/v1/intake_submissions?select=full_name`, { headers: anon });
  expect(list.ok()).toBe(false);
  const forged = await request.post(`${url}/rest/v1/rpc/submit_public_form`, {
    headers: anon,
    data: { p_key: "adivinada", p_code: publicPath.split("/").pop(), p: { first_name: "Robot", last_name: "Falso", email: "robot@correo.test", consent: true } },
  });
  expect(forged.ok()).toBe(false);
  const upload = await request.post(`${url}/storage/v1/object/curriculums/envios/00000000-0000-4000-8000-000000000000/x.pdf`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/pdf" },
    data: PDF,
  });
  expect(upload.ok()).toBe(false);
});
