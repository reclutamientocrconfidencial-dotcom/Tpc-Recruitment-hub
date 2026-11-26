import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD, USERS, env, type UserKey } from "./fixtures";

/** Fase 6: Mi jornada (alertas y tareas), calendario sin datos personales e indicadores de productividad. */
const RUN = Date.now().toString().slice(-6);

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

test.describe.configure({ mode: "serial" });

let applicationId = "";
let vacancyCode = "";
let upcomingId = "";
const CAND = `Jornada ${RUN}`;

test.beforeAll(async ({ request }) => {
  const coord = await api(request, "coordinador");
  const recruiter = await api(request, "reclutador");
  const [req] = await coord.post<Array<{ id: string }>>("requisitions", { client_id: "11111111-0000-4000-8000-000000000002", title: `Requisición Jornada ${RUN}`, positions_count: 1, status: "pendiente_aprobacion" });
  await request.patch(`${coord.rest}/requisitions?id=eq.${req!.id}`, { headers: coord.headers, data: { status: "aprobada" } });
  const [vac] = await coord.post<Array<{ id: string; code: string }>>("vacancies", { requisition_id: req!.id, title: `Vacante Jornada ${RUN}`, openings: 1, status: "abierta", recruiter_id: recruiter.userId });
  vacancyCode = vac!.code;
  const cand = await coord.post<string>("rpc/save_candidate", { p_id: null, p: { first_name: "Inés", last_name: CAND, consent: { channel: "correo", evidence: "Prueba E2E ficticia" } } });
  applicationId = await coord.post<string>("rpc/create_application", { p_vacancy_id: vac!.id, p_candidate_id: cand });
  await request.patch(`${coord.rest}/applications?id=eq.${applicationId}`, { headers: coord.headers, data: { recruiter_id: recruiter.userId } });
  const tr = await request.post(`${recruiter.rest}/rpc/update_application_tracking`, { headers: recruiter.headers, data: { p_application_id: applicationId, p_rating: null, p_next_action: `Enviar terna ficticia ${RUN}`, p_next_action_at: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10) } });
  expect(tr.ok(), await tr.text()).toBe(true);
  const [up] = await recruiter.post<Array<{ id: string }>>("interviews", { application_id: applicationId, kind: "virtual", scheduled_at: new Date(Date.now() + 2 * 86_400_000).toISOString(), interviewer_id: recruiter.userId, location: "https://reunion.example/abc" });
  upcomingId = up!.id;
  await recruiter.post("interviews", { application_id: applicationId, kind: "telefonica", scheduled_at: new Date(Date.now() - 86_400_000).toISOString(), interviewer_id: recruiter.userId });
});

test("reclutador: alertas del día y tareas con seguimiento a clientes", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.getByRole("link", { name: "Mi jornada" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mi jornada" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Entrevistas próximas" })).toContainText(`Inés ${CAND}`);
  await expect(page.getByRole("list", { name: "Entrevistas sin resultado" })).toContainText(`Inés ${CAND}`);
  await expect(page.getByRole("list", { name: "Próximos pasos vencidos o de hoy" })).toContainText(`Enviar terna ficticia ${RUN}`);
  const form = page.getByRole("form", { name: "Nueva tarea" });
  await expect(form.getByLabel("Responsable")).toHaveCount(0);
  await form.getByLabel("Tarea").fill(`Confirmar terna con el cliente ${RUN}`);
  await form.getByLabel("Tipo").selectOption("seguimiento_cliente");
  await form.getByLabel("Fecha y hora").fill("2026-01-05T09:00");
  await form.getByLabel("Cliente (opcional)").selectOption({ index: 1 });
  await form.getByRole("button", { name: "Agregar tarea" }).click();
  const item = page.getByRole("list", { name: "Mis tareas" }).getByRole("listitem").filter({ hasText: `Confirmar terna con el cliente ${RUN}` });
  await expect(item).toContainText("Seguimiento a cliente");
  await expect(item).toContainText("Vencida");
  await item.getByRole("button", { name: "Hecha" }).click();
  await expect(page.getByRole("list", { name: "Mis tareas" }).getByRole("listitem").filter({ hasText: `Confirmar terna con el cliente ${RUN}` })).toHaveCount(0);
});

test("coordinación asigna una tarea y ve las vencidas del equipo", async ({ page }) => {
  await loginAs(page, "coordinador");
  await page.goto("/mi-jornada");
  const form = page.getByRole("form", { name: "Nueva tarea" });
  await form.getByLabel("Tarea").fill(`Tarea asignada ${RUN}`);
  await form.getByLabel("Fecha y hora").fill("2026-01-06T10:00");
  await form.getByLabel("Responsable").selectOption({ label: USERS.reclutador.name });
  await form.getByRole("button", { name: "Agregar tarea" }).click();
  await expect(form.getByText("Tarea agregada.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("list", { name: "Tareas vencidas del equipo" })).toContainText(`Tarea asignada ${RUN}`);
  await page.context().clearCookies();
  await loginAs(page, "reclutador");
  await page.goto("/mi-jornada");
  await expect(page.getByRole("list", { name: "Mis tareas" })).toContainText(`Tarea asignada ${RUN}`);
});

test("calendario: suscripción sin datos personales, descarga .ics y revocación", async ({ page, playwright }) => {
  await loginAs(page, "reclutador");
  await page.goto("/mi-jornada");
  const soon = new Date(Date.now() + 3 * 86_400_000 - 6 * 3600_000).toISOString().slice(0, 16);
  const form = page.getByRole("form", { name: "Nueva tarea" });
  await form.getByLabel("Tarea").fill(`Tarea futura ${RUN}`);
  await form.getByLabel("Fecha y hora").fill(soon);
  await form.getByRole("button", { name: "Agregar tarea" }).click();
  await expect(form.getByText("Tarea agregada.")).toBeVisible();
  await page.getByRole("button", { name: /Generar enlace de calendario|Renovar enlace/ }).click();
  const url = await page.getByLabel(/Enlace de suscripción/).inputValue();
  expect(url).toMatch(/\/api\/calendario\/[0-9a-f]{64}$/);
  const path = new URL(url).pathname;
  const anon = await playwright.request.newContext({ baseURL: page.url() });
  const feed = await anon.get(path);
  expect(feed.status()).toBe(200);
  expect(feed.headers()["content-type"]).toContain("text/calendar");
  const ics = await feed.text();
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain(`Entrevista virtual · ${vacancyCode}`);
  expect(ics).toContain(`Tarea: Tarea futura ${RUN}`);
  expect(ics).not.toContain(`Tarea asignada ${RUN}`); // vencida hace más de 30 días
  expect(ics).not.toContain(CAND);
  // Descarga de una entrevista (con sesión)
  const one = await page.request.get(`/api/entrevistas/${upcomingId}/ics`);
  expect(one.status()).toBe(200);
  expect(await one.text()).toContain("BEGIN:VEVENT");
  // Revocar: el enlace deja de entregar eventos
  await page.reload();
  await page.getByRole("button", { name: "Revocar enlace" }).click();
  await expect(page.getByText("Enlace de calendario revocado.")).toBeVisible();
  const after = await anon.get(path);
  expect(await after.text()).not.toContain("BEGIN:VEVENT");
  expect((await anon.get(`/api/calendario/${"0".repeat(64)}`)).status()).toBe(200);
  expect((await anon.get("/api/calendario/no-es-un-token")).status()).toBe(404);
  await anon.dispose();
});

test("productividad: el reclutador ve lo suyo y coordinación ve al equipo", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto("/productividad");
  await expect(page.getByText("Sus propios indicadores.")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr").first()).toContainText(USERS.reclutador.name);
  await page.context().clearCookies();
  await loginAs(page, "coordinador");
  await page.goto("/productividad");
  await expect(page.getByText("Equipo completo (administración y coordinación).")).toBeVisible();
  expect(await page.locator("tbody tr").count()).toBeGreaterThan(2);
  await page.goto("/productividad?desde=2020-01-01&hasta=2026-12-31");
  await expect(page.getByText("Rango de fechas no válido (máximo un año).")).toBeVisible();
});

test("consulta: sin Mi jornada ni productividad", async ({ page }) => {
  await loginAs(page, "consulta");
  await expect(page.getByRole("link", { name: "Mi jornada" })).toHaveCount(0);
  await page.goto("/mi-jornada");
  await expect(page.getByText("Mi jornada es para el personal operativo.")).toBeVisible();
  await page.goto("/productividad");
  await expect(page.getByText("Los indicadores de productividad no están disponibles para su rol.")).toBeVisible();
});
