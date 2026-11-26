import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD, USERS, env, type UserKey } from "./fixtures";

/** Fase 4: entrevistas con guion, evaluaciones por vacante, credenciales con vigencia e informe ejecutivo exportable. */
const RUN = Date.now().toString().slice(-6);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

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
    async get<T>(path: string): Promise<T> {
      const r = await request.get(`${url}/rest/v1/${path}`, { headers });
      expect(r.ok()).toBe(true);
      return (await r.json()) as T;
    },
  };
}

test.describe.configure({ mode: "serial" });

let vacancyId = "";
let applicationId = "";
let candidateId = "";
const NAME = `Rocío Evaluada ${RUN}`;

test.beforeAll(async ({ request }) => {
  const coord = await api(request, "coordinador");
  const recruiter = await api(request, "reclutador");
  const [req] = await coord.post<Array<{ id: string }>>("requisitions", { client_id: "11111111-0000-4000-8000-000000000002", title: `Requisición Evaluaciones ${RUN}`, positions_count: 1, status: "pendiente_aprobacion" });
  await request.patch(`${coord.rest}/requisitions?id=eq.${req!.id}`, { headers: coord.headers, data: { status: "aprobada" } });
  const [vac] = await coord.post<Array<{ id: string }>>("vacancies", { requisition_id: req!.id, title: `Vacante Evaluaciones ${RUN}`, openings: 1, status: "abierta", recruiter_id: recruiter.userId });
  vacancyId = vac!.id;
  const [excel] = await coord.get<Array<{ id: string }>>("assessment_types?name=eq.Prueba%20de%20Excel&select=id");
  await coord.post("vacancy_assessments", { vacancy_id: vacancyId, assessment_type_id: excel!.id, requirement: "obligatoria" });
  await coord.post("interview_questions", { text: `Pregunta del cliente ficticio ${RUN}`, category: "tecnica", client_id: "11111111-0000-4000-8000-000000000002" });
  candidateId = await coord.post<string>("rpc/save_candidate", { p_id: null, p: { first_name: "Rocío", last_name: `Evaluada ${RUN}`, consent: { channel: "correo", evidence: "Prueba E2E ficticia" } } });
  applicationId = await coord.post<string>("rpc/create_application", { p_vacancy_id: vacancyId, p_candidate_id: candidateId });
});

test("coordinación agrega una evaluación deseable a la vacante", async ({ page }) => {
  await loginAs(page, "coordinador");
  await page.goto(`/vacantes/${vacancyId}`);
  const form = page.getByRole("form", { name: "Agregar evaluación a la vacante" });
  await form.getByLabel("Evaluación").selectOption({ label: "Prueba de inglés" });
  await form.getByLabel("Exigencia").selectOption("deseable");
  await form.getByLabel("Nivel mínimo").selectOption({ label: "B2" });
  await form.getByRole("button", { name: "Guardar" }).click();
  const list = page.getByRole("list", { name: "Evaluaciones configuradas" });
  await expect(list.getByRole("listitem").filter({ hasText: "Prueba de inglés" })).toContainText("Nivel mínimo B2");
  await expect(list.getByRole("listitem").filter({ hasText: "Prueba de Excel" })).toContainText("Obligatoria");
});

test("reclutador: entrevista con guion del banco y resultado con recomendación", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto(`/postulaciones/${applicationId}`);
  await page.getByRole("link", { name: "Programar" }).click();
  await page.getByLabel("Fecha y hora (Costa Rica)").fill("2026-12-10T09:30");
  await page.getByLabel("Modalidad").selectOption("presencial");
  await page.getByLabel("Lugar o enlace de la reunión").fill("Oficinas TPC, sala 2");
  await page.getByRole("button", { name: "Programar entrevista" }).click();
  await expect(page).toHaveURL(/\/entrevistas\/[0-9a-f-]{36}\?ok=creado$/);
  await expect(page.getByText(/10 dic 2026, 09:30 · Presencial/)).toBeVisible();
  const guion = page.getByRole("list", { name: "Guion de la entrevista" });
  await expect(guion).toContainText("Cuénteme sobre su experiencia laboral");
  await expect(guion).toContainText(`Pregunta del cliente ficticio ${RUN}`);
  await page.getByLabel("Notas de la pregunta 1", { exact: true }).fill("Respuesta ficticia muy clara");
  await page.getByLabel("Calificación de la pregunta 1", { exact: true }).selectOption("5");
  await page.getByLabel("Estado").selectOption("realizada");
  await page.getByRole("button", { name: "Guardar entrevista" }).click();
  await expect(page.getByText("Indique la recomendación de la entrevista.")).toBeVisible();
  await page.getByLabel("Recomendación").selectOption("recomendado");
  await page.getByLabel("Resumen de la entrevista").fill(`Resumen ficticio de la entrevista ${RUN}`);
  await page.getByRole("button", { name: "Guardar entrevista" }).click();
  await expect(page.getByText("Entrevista guardada.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Notas de la pregunta 1", { exact: true })).toHaveValue("Respuesta ficticia muy clara");
  await page.getByRole("link", { name: "Volver a la postulación" }).click();
  const list = page.getByRole("list", { name: "Entrevistas" });
  await expect(list).toContainText("Realizada");
  await expect(list).toContainText("Recomendado");
});

test("reclutador: resultados de evaluaciones con validación de puntaje", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto(`/postulaciones/${applicationId}`);
  const excel = page.getByRole("form", { name: "Resultado de Prueba de Excel" });
  await excel.getByLabel("Estado de Prueba de Excel").selectOption("aprobada");
  await excel.getByLabel("Puntaje de Prueba de Excel").fill("150");
  await excel.getByRole("button", { name: "Guardar" }).click();
  await expect(excel.getByText("El puntaje supera el máximo de la evaluación (100)")).toBeVisible();
  await excel.getByLabel("Puntaje de Prueba de Excel").fill("85");
  await excel.getByRole("button", { name: "Guardar" }).click();
  await expect(excel.getByText("✓ Guardado")).toBeVisible();
  const ingles = page.getByRole("form", { name: "Resultado de Prueba de inglés" });
  await ingles.getByLabel("Estado de Prueba de inglés").selectOption("aprobada");
  await ingles.getByLabel("Nivel en Prueba de inglés").selectOption({ label: "C1" });
  await ingles.getByRole("button", { name: "Guardar" }).click();
  await expect(ingles.getByText("✓ Guardado")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Obligatorias aprobadas: 1 de 1")).toBeVisible();
});

test("informe ejecutivo: borrador prellenado, finalizado y exportación registrada en Word y PDF", async ({ page, request }) => {
  await loginAs(page, "reclutador");
  await page.goto(`/postulaciones/${applicationId}`);
  await page.getByRole("button", { name: "Crear informe ejecutivo" }).click();
  await expect(page).toHaveURL(new RegExp(`/postulaciones/${applicationId}/informe$`));
  // Plantilla v2: las evaluaciones se agregan solas al exportar; las entrevistas prellenan las evidencias.
  await expect(page.getByLabel("Evidencias de la entrevista")).toHaveValue(new RegExp(`Resumen ficticio de la entrevista ${RUN}`));
  await page.getByLabel("Resumen ejecutivo").fill("Perfil ficticio: 5 años en ventas corporativas.");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText("Borrador guardado.")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Finalizar informe" }).click();
  await expect(page.getByText("Indique la recomendación antes de finalizar el informe.")).toBeVisible();
  await page.getByLabel("Recomendación final").selectOption("recomendado");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Finalizar informe" }).click();
  await expect(page.getByText("Informe finalizado. Ya puede exportarlo.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Final · versión 1/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reabrir (versión nueva)" })).toHaveCount(0);
  await expect(page.getByLabel("Resumen ejecutivo")).toHaveAttribute("readonly", "");

  const docxHref = await page.getByRole("link", { name: "Word (.docx)" }).getAttribute("href");
  const docx = await page.request.get(docxHref!);
  expect(docx.status()).toBe(200);
  expect(docx.headers()["content-disposition"]).toContain(`Informe-ejecutivo-Rocio-Evaluada-${RUN}-v1.docx`);
  expect((await docx.body()).subarray(0, 2).toString()).toBe("PK");
  const pdfHref = await page.getByRole("link", { name: "PDF" }).getAttribute("href");
  const pdf = await page.request.get(pdfHref!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  const reportId = pdfHref!.split("/")[3]!;
  const admin = await api(request, "admin");
  const logs = await admin.get<unknown[]>(`access_logs?select=reason&action=eq.exportar&resource=eq.informe_ejecutivo&record_id=eq.${reportId}`);
  expect(logs).toHaveLength(2);
});

test("coordinación reabre el informe como versión 2", async ({ page }) => {
  await loginAs(page, "coordinador");
  await page.goto(`/postulaciones/${applicationId}/informe`);
  await page.getByRole("button", { name: "Reabrir (versión nueva)" }).click();
  await expect(page.getByText("Informe reabierto como versión nueva.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Borrador · versión 2/)).toBeVisible();
  await expect(page.getByRole("link", { name: "PDF" })).toHaveCount(0);
});

test("credenciales: carné con respaldo, alerta de vencimiento y verificación", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto(`/candidatos/${candidateId}`);
  const form = page.getByRole("form", { name: "Registrar credencial" });
  await form.getByLabel("Tipo").selectOption({ label: "Carné de manipulación de alimentos" });
  await form.getByRole("button", { name: "Registrar credencial" }).click();
  await expect(form.getByText(/Indique la fecha de vencimiento de «Carné de manipulación de alimentos»/)).toBeVisible();
  const in10 = new Date(Date.now() + 10 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
  await form.getByLabel("Tipo").selectOption({ label: "Carné de manipulación de alimentos" });
  await form.getByLabel("Número (opcional)").fill(`MA-${RUN}`);
  await form.getByLabel("Vencimiento").fill(in10);
  await form.getByLabel(/Respaldo/).setInputFiles({ name: "carne.png", mimeType: "image/png", buffer: PNG });
  await form.getByRole("button", { name: "Registrar credencial" }).click();
  await expect(form.getByText("Credencial registrada.")).toBeVisible();
  const item = page.getByRole("list", { name: "Credenciales" }).getByRole("listitem").filter({ hasText: `MA-${RUN}` });
  await expect(item).toContainText("Vence en 10 día(s)");
  await expect(item).toContainText("Respaldo: carne.png");
  await expect(item).toContainText("Sin verificar");
  await item.getByRole("button", { name: "Marcar verificada" }).click();
  await expect(item).toContainText(/Verificado .* por Reclutador Ficticio/);
  await page.goto("/candidatos/vencimientos");
  await expect(page.getByRole("row", { name: new RegExp(NAME) })).toContainText("Vence en 10 día(s)");
});

test("permisos: consulta no ve evaluaciones ni exporta; reclutador no administra catálogos", async ({ page, request }) => {
  const coord = await api(request, "coordinador");
  const [report] = await coord.get<Array<{ id: string }>>(`executive_reports?application_id=eq.${applicationId}&select=id`);
  await loginAs(page, "consulta");
  await page.goto(`/postulaciones/${applicationId}`);
  await expect(page.getByText("Vista de solo lectura para su rol.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Entrevistas" })).toHaveCount(0);
  const res = await page.request.get(`/api/informes/${report!.id}/pdf`);
  expect(res.status()).toBe(403);
  await page.goto("/candidatos/vencimientos");
  await expect(page.getByText("Los vencimientos de credenciales no están disponibles para su rol.")).toBeVisible();
  await page.context().clearCookies();
  await loginAs(page, "reclutador");
  await page.goto("/administracion/evaluaciones");
  await expect(page.getByRole("heading", { name: "Acceso restringido" })).toBeVisible();
});

test("administración publica una nueva versión de la plantilla del informe", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/administracion/evaluaciones");
  const form = page.getByRole("form", { name: "Nueva versión de la plantilla" });
  await form.getByLabel("Versión").fill(`E2E-${RUN}`);
  await form.getByLabel(/Secciones/).fill("Perfil del candidato | Formación\nResultados de evaluaciones\nRecomendación");
  await form.getByRole("button", { name: "Publicar nueva versión" }).click();
  await expect(form.getByText(`Plantilla «E2E-${RUN}» vigente.`, { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText(new RegExp(`Vigente: .* versión E2E-${RUN}`))).toBeVisible();
  // Restaura una plantilla con los apartados v2 para no afectar otras pruebas
  await form.getByLabel("Versión").fill(`2026-2-E2E-${RUN}`);
  await form.getByLabel(/Secciones/).fill(
    "Resumen ejecutivo\nEvidencias de la entrevista\nCasos prácticos\nFortalezas destacadas\nAspectos por validar\nDisponibilidad y condiciones laborales\nConclusión y recomendación del reclutador",
  );
  await form.getByRole("button", { name: "Publicar nueva versión" }).click();
  await expect(form.getByText(/vigente/)).toBeVisible();
});
