import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD, USERS, env, type UserKey } from "./fixtures";

/**
 * Fase 5: IA modular con el proveedor SIMULADO (no se envía nada a terceros).
 * Revisión humana obligatoria, seudonimización, aplicación controlada y costos.
 */
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

let vacancyId = "";
let applicationId = "";
let candidateId = "";

test.beforeAll(async ({ request }) => {
  const admin = await api(request, "admin");
  const r = await request.patch(`${admin.rest}/ai_settings?id=eq.true`, { headers: admin.headers, data: { enabled: true, provider: "simulado", daily_requests_per_user: 500 } });
  expect(r.ok(), await r.text()).toBe(true);
  const coord = await api(request, "coordinador");
  const recruiter = await api(request, "reclutador");
  const [req] = await coord.post<Array<{ id: string }>>("requisitions", { client_id: "11111111-0000-4000-8000-000000000002", title: `Requisición IA ${RUN}`, positions_count: 1, status: "pendiente_aprobacion" });
  await request.patch(`${coord.rest}/requisitions?id=eq.${req!.id}`, { headers: coord.headers, data: { status: "aprobada" } });
  const [vac] = await coord.post<Array<{ id: string }>>("vacancies", { requisition_id: req!.id, title: `Analista IA ${RUN}`, description: "Vacante ficticia para pruebas de IA.", openings: 1, status: "abierta", recruiter_id: recruiter.userId });
  vacancyId = vac!.id;
  await coord.post("requirement_templates", { vacancy_id: vacancyId, requirement: `Excel avanzado ${RUN}`, requirement_type: "obligatorio", weight: 5 });
  await coord.post("requirement_templates", { vacancy_id: vacancyId, requirement: `Licencia B1 ${RUN}`, requirement_type: "deseable", weight: 2 });
  candidateId = await coord.post<string>("rpc/save_candidate", {
    p_id: null,
    p: { first_name: "Valeria", last_name: `Simulada ${RUN}`, email: `valeria.${RUN}@correo.test`, consent: { channel: "correo", evidence: "Prueba E2E ficticia" } },
  });
  applicationId = await coord.post<string>("rpc/create_application", { p_vacancy_id: vacancyId, p_candidate_id: candidateId });
});

test("administración: el proveedor externo exige acuerdo y presupuesto", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/administracion/ia");
  const form = page.getByRole("form", { name: "Configuración de IA" });
  await form.getByLabel("Proveedor", { exact: true }).selectOption("anthropic");
  await form.getByRole("button", { name: "Guardar configuración" }).click();
  await expect(form.getByText(/confirme el acuerdo de tratamiento de datos y defina un presupuesto/)).toBeVisible();
  await form.getByLabel("Proveedor", { exact: true }).selectOption("simulado");
  await form.getByRole("button", { name: "Guardar configuración" }).click();
  await expect(form.getByText("Configuración guardada.")).toBeVisible();
});

test("comparación vacante ↔ candidato: pendiente de revisión hasta que una persona la acepta", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto(`/postulaciones/${applicationId}`);
  await expect(page.getByText(/Proveedor: simulado/)).toBeVisible();
  await page.getByRole("button", { name: "Comparar con la vacante" }).click();
  const results = page.getByRole("list", { name: "Resultados de IA" });
  const item = results.getByRole("listitem").filter({ hasText: "Comparación vacante ↔ candidato" }).first();
  await expect(item).toContainText("Pendiente de revisión");
  await expect(item).toContainText("Generado por IA · verifique antes de usar");
  await expect(item).toContainText(`Verificar: Excel avanzado ${RUN}`);
  await expect(item).toContainText("seudonimizado");
  await expect(item).toContainText("US$ 0.0000");
  await item.getByRole("button", { name: "Aceptar" }).click();
  await expect(item).toContainText("Aceptado por una persona");
  await expect(item).toContainText("revisado por Reclutador Ficticio");
});

test("borrador del informe: se aplica solo tras aceptarlo y sin sobrescribir lo escrito", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto(`/postulaciones/${applicationId}`);
  await page.getByRole("button", { name: "Crear informe ejecutivo" }).click();
  await page.getByLabel("Resumen ejecutivo").fill("Texto escrito por la reclutadora (no se sobrescribe).");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText("Borrador guardado.")).toBeVisible();
  await page.goto(`/postulaciones/${applicationId}`);
  await page.getByRole("button", { name: "Redactar borrador del informe" }).click();
  const item = page.getByRole("list", { name: "Resultados de IA" }).getByRole("listitem").filter({ hasText: "Borrador del informe ejecutivo" }).first();
  await expect(item).toContainText("Pendiente de revisión");
  await expect(item.getByRole("button", { name: "Completar secciones vacías del informe" })).toHaveCount(0);
  await item.getByRole("button", { name: "Aceptar" }).click();
  await item.getByRole("button", { name: "Completar secciones vacías del informe" }).click();
  await expect(item.getByText(/Se completaron \d+ sección\(es\) vacía\(s\)/)).toBeVisible();
  await page.goto(`/postulaciones/${applicationId}/informe`);
  await expect(page.getByLabel("Resumen ejecutivo")).toHaveValue("Texto escrito por la reclutadora (no se sobrescribe).");
  await expect(page.getByLabel("Fortalezas destacadas")).toHaveValue(/Borrador simulado/);
});

test("lectura del CV: borrador seudonimizado para revisar; descartar elimina el resultado", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto(`/candidatos/${candidateId}`);
  const form = page.getByRole("form", { name: "Leer currículum" });
  await form.getByLabel("Texto del currículum").fill(
    `Valeria Simulada ${RUN}\nvaleria.${RUN}@correo.test · 8800-1122\n\nExperiencia laboral\nAnalista de inventarios - Logística Ficticia S.A.\nEne 2019 - Actualidad\n• Control de inventarios en SAP\n\nIdiomas\nInglés B2`,
  );
  await form.getByRole("button", { name: "Leer currículum" }).click();
  await expect(page).toHaveURL(new RegExp(`/candidatos/${candidateId}/perfil-cv/`));
  await expect(page.getByLabel("Cargo")).toHaveValue("Analista de inventarios");
  await expect(page.getByLabel("Nivel (MCER)")).toHaveValue("B2");
  await expect(page.locator("body")).not.toContainText(`valeria.${RUN}`);
  await expect(page.locator("body")).not.toContainText("8800-1122");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Descartar esta lectura" }).click();
  await expect(page).toHaveURL(new RegExp(`/candidatos/${candidateId}$`));
  await expect(page.getByText("Sin perfil curricular confirmado.")).toBeVisible();
});

test("preguntas sugeridas: coordinación las acepta y las agrega al banco", async ({ page }) => {
  await loginAs(page, "coordinador");
  await page.goto(`/vacantes/${vacancyId}`);
  await page.getByRole("button", { name: "Sugerir preguntas de entrevista" }).click();
  const item = page.getByRole("list", { name: "Resultados de IA" }).getByRole("listitem").filter({ hasText: "Preguntas de entrevista sugeridas" }).first();
  await expect(item).toContainText(`«Excel avanzado ${RUN}»`);
  await item.getByRole("button", { name: "Aceptar" }).click();
  await item.getByRole("button", { name: "Agregar al banco de preguntas" }).click();
  await expect(item.getByText(/pregunta\(s\) agregadas al banco/)).toBeVisible();
  await page.goto("/administracion/evaluaciones");
  await expect(page.getByRole("list", { name: "Banco de preguntas" })).toContainText(`«Excel avanzado ${RUN}»`);
});

test("permisos y costos: consulta no usa IA; administración ve el consumo", async ({ page }) => {
  await loginAs(page, "consulta");
  await page.goto(`/postulaciones/${applicationId}`);
  await expect(page.getByRole("heading", { name: "Asistente de IA" })).toHaveCount(0);
  await page.goto("/administracion/ia");
  await expect(page.getByRole("heading", { name: "Acceso restringido" })).toBeVisible();
  await page.context().clearCookies();
  await loginAs(page, "admin");
  await page.goto("/administracion/ia");
  await expect(page.getByTestId("ai-month-cost")).toContainText("0,00");
  await expect(page.getByText(/Comparación vacante ↔ candidato: \d+/)).toBeVisible();
});
