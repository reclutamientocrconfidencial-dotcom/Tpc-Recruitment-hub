import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD, USERS, env, type UserKey } from "./fixtures";

/**
 * Mejoras de las fases 4 y 5 (migración 1700) con el proveedor SIMULADO:
 * lectura y confirmación del CV, preselección individual y por lotes,
 * guion de entrevista editable con salvaguardas, criterios aprobados y
 * ponderados, e informe comparativo de terna. Solo datos ficticios.
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
    async patch(path: string, data: unknown) {
      const r = await request.patch(`${url}/rest/v1/${path}`, { headers, data });
      expect(r.ok(), `${path}: ${await r.text()}`).toBe(true);
    },
    async get<T>(path: string): Promise<T> {
      const r = await request.get(`${url}/rest/v1/${path}`, { headers });
      expect(r.ok(), await r.text()).toBe(true);
      return (await r.json()) as T;
    },
  };
}

test.describe.configure({ mode: "serial" });

let vacancyId = "";
const apps: string[] = [];
const cands: string[] = [];
let interviewId = "";

const CV = `Experiencia laboral
Asistente contable - Servicios Ficticios ${RUN} S.A.
Feb 2018 - Presente
• Conciliaciones bancarias y cuentas por pagar
• Implementé un control en Excel que redujo atrasos en 30%

Formación académica
Bachillerato en Contaduría - Universidad Ficticia (2013 - 2017)

Habilidades
Excel avanzado, SAP

Idiomas
Inglés intermedio (B1)`;

test.beforeAll(async ({ request }) => {
  const admin = await api(request, "admin");
  await admin.patch("ai_settings?id=eq.true", { enabled: true, provider: "simulado", daily_requests_per_user: 500 });
  const coord = await api(request, "coordinador");
  const recruiter = await api(request, "reclutador");
  const [req] = await coord.post<Array<{ id: string }>>("requisitions", { client_id: "11111111-0000-4000-8000-000000000002", title: `Requisición Mejoras ${RUN}`, positions_count: 2, status: "pendiente_aprobacion" });
  await coord.patch(`requisitions?id=eq.${req!.id}`, { status: "aprobada" });
  const [vac] = await coord.post<Array<{ id: string }>>("vacancies", {
    requisition_id: req!.id,
    title: `Asistente contable ${RUN}`,
    description: "Conciliaciones bancarias, cuentas por pagar y facturación electrónica.",
    openings: 2,
    status: "abierta",
    recruiter_id: recruiter.userId,
  });
  vacancyId = vac!.id;
  await coord.post("requirement_templates", { vacancy_id: vacancyId, requirement: "Excel avanzado", requirement_type: "obligatorio", weight: 5 });
  await coord.post("requirement_templates", { vacancy_id: vacancyId, requirement: "Inglés B2", requirement_type: "deseable", weight: 2 });
  await coord.post("requirement_templates", { vacancy_id: vacancyId, requirement: "Licencia de conducir B1", requirement_type: "obligatorio", weight: 3 });
  const [caso] = await coord.get<Array<{ id: string }>>("assessment_types?name=eq.Caso%20pr%C3%A1ctico&select=id");
  await coord.post("vacancy_assessments", { vacancy_id: vacancyId, assessment_type_id: caso!.id, requirement: "obligatoria" });
  for (const [first, last] of [["Lucía", `Contable ${RUN}`], ["Andrés", `Contable ${RUN}`], ["Paula", `Contable ${RUN}`]] as const) {
    const id = await coord.post<string>("rpc/save_candidate", { p_id: null, p: { first_name: first, last_name: last, email: `${first.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${RUN}@correo.test`, consent: { channel: "correo", evidence: "Prueba E2E ficticia" } } });
    cands.push(id);
    apps.push(await coord.post<string>("rpc/create_application", { p_vacancy_id: vacancyId, p_candidate_id: id }));
  }
  // Perfiles confirmados (por API) para el 2.º y 3.er candidato
  for (const [i, data] of [
    [1, { puesto_actual: "Auxiliar contable", anios_experiencia: 3, habilidades: ["Excel avanzado"], idiomas: [{ idioma: "Inglés", nivel: "B2" }] }],
    [2, { puesto_actual: "Cajera", anios_experiencia: 2, habilidades: ["Atención al cliente"], licencias: ["Licencia de conducir B1"] }],
  ] as const) {
    const [p] = await recruiter.post<Array<{ id: string }>>("candidate_cv_profiles", { candidate_id: cands[i], source: "manual", data });
    const c = await request.post(`${recruiter.rest}/rpc/confirm_cv_profile`, { headers: recruiter.headers, data: { p_id: p!.id, p_update_candidate: false } });
    expect(c.ok(), await c.text()).toBe(true);
  }
});

test("lectura del CV: revisar, corregir y confirmar antes de incorporarlo a la ficha", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto(`/candidatos/${cands[0]}`);
  const form = page.getByRole("form", { name: "Leer currículum" });
  await form.getByLabel("Texto del currículum").fill(`Lucía Contable ${RUN}\nlucia.${RUN}@correo.test · 8800-4455\n\n${CV}`);
  await form.getByRole("button", { name: "Leer currículum" }).click();
  await expect(page).toHaveURL(new RegExp(`/perfil-cv/`));
  await expect(page.getByText("Lectura completa")).toBeVisible();
  await expect(page.getByLabel("Cargo")).toHaveValue("Asistente contable");
  await expect(page.getByLabel("Empresa")).toHaveValue(`Servicios Ficticios ${RUN} S.A.`);
  await expect(page.getByLabel("Logros")).toHaveValue(/30%/);
  await expect(page.getByLabel("Título o grado")).toHaveValue("Bachillerato en Contaduría");
  await expect(page.locator("body")).not.toContainText("8800-4455");
  // Corrección humana: el nivel de inglés y un puesto adicional
  await page.getByLabel("Nivel (MCER)").selectOption("B2");
  await page.getByRole("button", { name: "Agregar puesto" }).click();
  await page.getByLabel("Cargo").nth(1).fill("Auxiliar administrativa");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText("Cambios guardados (sigue en borrador).")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Confirmar e incorporar a la ficha" }).click();
  await expect(page.getByText("Perfil confirmado e incorporado a la ficha.")).toBeVisible();
  await page.goto(`/candidatos/${cands[0]}`);
  const card = page.locator("section, div").filter({ has: page.getByRole("heading", { name: "Perfil curricular" }) }).first();
  await expect(card).toContainText("Confirmado");
  await expect(card).toContainText("Inglés B2");
  await expect(card).toContainText("Auxiliar administrativa");
});

test("archivos guardados: un PDF se lee en el navegador y un Word en el servidor", async ({ page, request }) => {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const { strToU8, zipSync } = await import("fflate");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pg = doc.addPage();
  CV.replace(/•/g, "-").split("\n").forEach((l, i) => pg.drawText(l, { x: 40, y: 760 - i * 14, size: 10, font }));
  const pdf = Buffer.from(await doc.save());
  const xml = `<w:document><w:body>${CV.split("\n").map((l) => `<w:p><w:r><w:t>${l.replace(/&/g, "&amp;")}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`;
  const docx = Buffer.from(zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": strToU8(xml) }));
  const files = [[`CV Paula ${RUN}.pdf`, "application/pdf", pdf], [`CV Paula ${RUN}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx]] as const;
  // Coordinación carga los archivos (regla de la fase 3); el reclutador los lee
  await loginAs(page, "coordinador");
  for (const [name, mime, buffer] of files) {
    await page.goto(`/candidatos/${cands[2]}`);
    const upload = page.getByRole("form", { name: "Cargar currículum" });
    await upload.getByLabel(/Cargar currículum/).setInputFiles({ name, mimeType: mime, buffer });
    await upload.getByRole("button", { name: "Cargar", exact: true }).click();
    await expect(page.getByText(name).first()).toBeVisible();
  }
  await page.context().clearCookies();
  await loginAs(page, "reclutador");
  for (const [name] of files) {
    await page.goto(`/candidatos/${cands[2]}`);
    const form = page.getByRole("form", { name: "Leer currículum" });
    await form.getByLabel("Currículum", { exact: true }).selectOption({ label: name });
    await form.getByRole("button", { name: "Leer currículum" }).click();
    await expect(page).toHaveURL(new RegExp(`/candidatos/${cands[2]}/perfil-cv/`));
    await expect(page.getByText("Lectura completa")).toBeVisible();
    await expect(page.getByLabel("Cargo")).toHaveValue("Asistente contable");
    await expect(page.getByLabel("Logros")).toHaveValue(/30%/);
  }
  // Cada lectura de archivo quedó registrada como acceso al currículum
  const admin = await api(request, "admin");
  const logs = await admin.get<unknown[]>(`access_logs?select=id&action=eq.descargar&resource=eq.curriculum&record_id=eq.${cands[2]}`);
  expect(logs.length).toBeGreaterThanOrEqual(2);
});

test("documento escaneado: se marca como no legible y no se envía a la IA", async ({ page, request }) => {
  const recruiter = await api(request, "reclutador");
  const before = await recruiter.get<unknown[]>(`ai_requests?candidate_id=eq.${cands[0]}&select=id`);
  await loginAs(page, "reclutador");
  await page.goto(`/candidatos/${cands[0]}`);
  const form = page.getByRole("form", { name: "Leer currículum" });
  await form.getByLabel("Texto del currículum").fill("� � � ilegible");
  await form.getByRole("button", { name: "Leer currículum" }).click();
  await expect(page.getByText("No legible: completar a mano")).toBeVisible();
  const after = await recruiter.get<unknown[]>(`ai_requests?candidate_id=eq.${cands[0]}&select=id`);
  expect(after.length).toBe(before.length);
});

test("preselección individual: matriz de cumplimiento revisada y registrada solo en requisitos pendientes", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto(`/postulaciones/${apps[0]}`);
  await page.getByRole("button", { name: "Analizar CV frente a la vacante (matriz)" }).click();
  const item = page.getByRole("list", { name: "Resultados de IA" }).getByRole("listitem").filter({ hasText: "Preselección con matriz de cumplimiento" }).first();
  await expect(item).toContainText("Pendiente de revisión");
  const row = (name: string) => item.getByRole("row").filter({ has: page.getByRole("rowheader", { name: new RegExp(name) }) });
  await expect(row("Excel avanzado")).toContainText("Cumplimiento confirmado");
  await expect(row("Inglés B2")).toContainText("Cumplimiento confirmado");
  await expect(row("Licencia de conducir")).toContainText("Información insuficiente");
  await expect(item.getByText(/la decisión es del reclutador/)).toBeVisible();
  await expect(item.getByRole("button", { name: "Registrar en los requisitos pendientes" })).toHaveCount(0);
  await item.getByRole("button", { name: "Aceptar" }).click();
  await item.getByRole("button", { name: "Registrar en los requisitos pendientes" }).click();
  await expect(item.getByText(/Se actualizaron 2 requisito\(s\) pendiente\(s\)/)).toBeVisible();
  // La etapa no cambia: la decisión sigue siendo humana
  await page.reload();
  await expect(page.getByLabel("Nota sobre Excel avanzado")).toHaveValue(/Preselección revisada: Habilidad: Excel avanzado/);
  await expect(page.getByLabel("Resultado de Excel avanzado")).toHaveValue("cumple");
  await expect(page.getByLabel("Resultado de Licencia de conducir B1")).toHaveValue("pendiente");
});

test("preselección por lotes: progreso, reutilización sin costo y comparación de candidatos", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto(`/vacantes/${vacancyId}/preseleccion`);
  await expect(page.getByText(/No descarta ni aprueba candidatos/)).toBeVisible();
  await page.getByRole("button", { name: "Analizar postulaciones activas" }).click();
  await expect(page.getByText(/3 de 3 · \d+ analizadas · \d+ reutilizadas sin costo · 0 con error · US\$ 0\.0000 · Completado/)).toBeVisible({ timeout: 20_000 });
  // Segunda corrida: nada cambió, todo se reutiliza
  await page.getByRole("button", { name: "Analizar postulaciones activas" }).click();
  await expect(page.getByText(/3 de 3 · 0 analizadas · 3 reutilizadas sin costo · 0 con error/)).toBeVisible({ timeout: 20_000 });
  const table = page.getByRole("table", { name: "Comparación de candidatos por requisito" });
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(table.getByRole("rowheader", { name: new RegExp(`Paula Contable ${RUN}`) })).toBeVisible();
  await expect(table).toContainText("Por revisar");
});

test("entrevista: guion personalizado y editable, sin preguntas discriminatorias", async ({ page, request }) => {
  const recruiter = await api(request, "reclutador");
  const [iv] = await recruiter.post<Array<{ id: string }>>("interviews", { application_id: apps[0], kind: "virtual", scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), duration_min: 45, interviewer_id: recruiter.userId });
  interviewId = iv!.id;
  await loginAs(page, "reclutador");
  await page.goto(`/postulaciones/${apps[0]}/entrevistas/${interviewId}`);
  const script = page.getByRole("list", { name: "Preguntas del guion" });
  await page.getByRole("button", { name: "Agregar pregunta" }).click();
  const add = page.getByRole("form", { name: "Agregar pregunta" });
  await add.getByLabel("Pregunta").fill("¿Tiene hijos pequeños?");
  await add.getByRole("button", { name: "Agregar pregunta" }).click();
  await expect(add.getByText(/tema no permitido \(familia o embarazo\)/)).toBeVisible();
  await add.getByLabel("Pregunta").fill(`¿Cómo organiza el cierre contable mensual? ${RUN}`);
  await add.getByLabel("Competencia evaluada").fill("Planificación");
  await add.getByRole("button", { name: "Agregar pregunta" }).click();
  await expect(script).toContainText(`¿Cómo organiza el cierre contable mensual? ${RUN}`);
  await expect(script).toContainText("Planificación · Manual");

  await page.getByRole("button", { name: "Proponer preguntas personalizadas" }).click();
  const proposal = page.getByRole("form", { name: "Propuesta de preguntas" });
  await expect(proposal).toContainText("Asistente contable");
  await expect(proposal).toContainText(/30%/);
  await proposal.getByRole("button", { name: "Agregar las marcadas al guion" }).click();
  await expect(proposal.getByText(/\d+ pregunta\(s\) agregada\(s\)/)).toBeVisible();
  await expect(script).toContainText("Propuesta IA revisada");

  const manual = script.getByRole("listitem").filter({ hasText: `cierre contable mensual? ${RUN}` });
  page.once("dialog", (d) => d.accept());
  await manual.getByRole("button", { name: "Quitar" }).click();
  await expect(script).not.toContainText(`cierre contable mensual? ${RUN}`);
});

test("conclusiones: organiza solo lo registrado y completa un resumen vacío tras revisión", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto(`/postulaciones/${apps[0]}/entrevistas/${interviewId}`);
  await page.getByRole("button", { name: "Organizar respuestas y conclusiones" }).click();
  await expect(page.getByText("Registre y guarde notas de al menos una respuesta antes de pedir conclusiones.")).toBeVisible();
  const result = page.getByRole("form", { name: "Resultado de la entrevista" });
  await result.getByLabel("Notas de la pregunta 1", { exact: true }).fill("Redujo atrasos de pago 30% con un control en Excel.");
  await result.getByLabel("Calificación de la pregunta 1", { exact: true }).selectOption("5");
  await result.getByRole("button", { name: "Guardar entrevista" }).click();
  await expect(result.getByText("Entrevista guardada.")).toBeVisible();
  await page.getByRole("button", { name: "Organizar respuestas y conclusiones" }).click();
  await expect(page.getByText("Borrador de conclusiones · generado por IA · verifique antes de usar")).toBeVisible();
  await page.getByRole("button", { name: "Usar como resumen de la entrevista" }).click();
  // Una vez completado, el botón desaparece (solo se ofrece con el resumen vacío)
  await expect(async () => {
    await page.reload();
    await expect(page.getByLabel("Resumen de la entrevista")).toHaveValue(/Evidencias:\n• .*30%/, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Usar como resumen de la entrevista" })).toHaveCount(0);
});

test("evaluaciones: el reclutador aprueba criterios y pesos; se califica por criterio con puntaje normalizado", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto(`/vacantes/${vacancyId}`);
  const item = page.getByRole("list", { name: "Evaluaciones configuradas" }).getByRole("listitem").filter({ hasText: "Caso práctico" });
  await expect(item).toContainText("Criterios sin aprobar");
  await item.getByText("Peso y criterios de calificación").click();
  const form = item.getByRole("form", { name: "Criterios de Caso práctico" });
  await expect(form.getByLabel("Criterios de calificación")).toHaveValue(/Análisis \| 2/);
  await form.getByLabel("Peso", { exact: true }).fill("2");
  await form.getByLabel(/Apruebo estos criterios/).check();
  await form.getByRole("button", { name: "Guardar criterios" }).click();
  await expect(form.getByText("Criterios y peso aprobados.")).toBeVisible();
  await page.reload();
  await expect(item).toContainText("Criterios aprobados por Reclutador Ficticio");

  await page.goto(`/postulaciones/${apps[0]}`);
  const res = page.getByRole("form", { name: "Resultado de Caso práctico" });
  await res.getByLabel("Estado de Caso práctico").selectOption("aprobada");
  await res.getByLabel("Calificación de Análisis").selectOption("5");
  await res.getByLabel("Calificación de Propuesta de solución").selectOption("4");
  await res.getByLabel("Calificación de Presentación").selectOption("4");
  await res.getByRole("button", { name: "Guardar" }).click();
  await expect(res.getByText("✓ Guardado")).toBeVisible();
  await page.reload();
  await expect(page.getByText("· 88 / 100")).toBeVisible();
  await expect(page.getByText(/Resultado ponderado: 88 \/ 100/)).toBeVisible();
});

test("terna: informe comparativo registrado; individual con el nuevo diseño", async ({ page, request }) => {
  const recruiter = await api(request, "reclutador");
  const [tpl] = await recruiter.get<Array<{ id: string }>>("report_templates?is_active=eq.true&select=id");
  const reports: string[] = [];
  for (const app of apps.slice(0, 2)) {
    const [r] = await recruiter.post<Array<{ id: string }>>("executive_reports", { application_id: app, template_id: tpl!.id, content: { resumen_ejecutivo: `Resumen ficticio ${RUN}`, fortalezas_destacadas: "Excel avanzado\nOrden" } });
    await recruiter.patch(`executive_reports?id=eq.${r!.id}`, { status: "final", recommendation: "recomendado" });
    reports.push(r!.id);
  }
  await loginAs(page, "reclutador");
  const one = await page.request.get(`/api/ternas/${vacancyId}/pdf?ids=${apps[0]}`);
  expect(one.status()).toBe(400);
  const pdf = await page.request.get(`/api/ternas/${vacancyId}/pdf?ids=${apps[0]}&ids=${apps[1]}`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const docx = await page.request.get(`/api/ternas/${vacancyId}/docx?ids=${apps[0]}&ids=${apps[1]}`);
  expect(docx.status()).toBe(200);
  expect(docx.headers()["content-disposition"]).toMatch(/Terna-VAC-\d{4}-\d{5}-v1\.docx/);
  const draft = await page.request.get(`/api/ternas/${vacancyId}/pdf?ids=${apps[0]}&ids=${apps[2]}`);
  expect(draft.status()).toBe(404);
  const single = await page.request.get(`/api/informes/${reports[0]}/pdf`);
  expect(single.status()).toBe(200);
  const logs = await (await api(request, "admin")).get<unknown[]>(`access_logs?resource=eq.terna&record_id=eq.${vacancyId}&select=id`);
  expect(logs.length).toBe(2);

  await page.goto(`/vacantes/${vacancyId}`);
  await expect(page.getByRole("heading", { name: "Informe comparativo de terna" })).toBeVisible();
  await page.context().clearCookies();
  await loginAs(page, "consulta");
  const denied = await page.request.get(`/api/ternas/${vacancyId}/pdf?ids=${apps[0]}&ids=${apps[1]}`);
  expect(denied.status()).toBe(403);
});
