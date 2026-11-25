import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD, USERS, env, type UserKey } from "./fixtures";

/** Fase 2D: postulaciones, tablero Kanban, seguimiento, historial y permisos por rol. */
const RUN = Date.now().toString().slice(-6);
const VAC = `Vacante Kanban ${RUN}`;

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

// Las pruebas comparten la vacante creada en beforeAll: se ejecutan en orden.
test.describe.configure({ mode: "serial" });

let vacancyId = "";
const candidates: Record<string, string> = {};

test.beforeAll(async ({ request }) => {
  const coord = await api(request, "coordinador");
  const recruiter = await api(request, "reclutador");
  const [req] = await coord.post<Array<{ id: string }>>("requisitions", { client_id: "11111111-0000-4000-8000-000000000002", title: `Requisición Kanban ${RUN}`, positions_count: 1, status: "pendiente_aprobacion" });
  const ok = await request.patch(`${coord.rest}/requisitions?id=eq.${req!.id}`, { headers: coord.headers, data: { status: "aprobada" } });
  expect(ok.ok()).toBe(true);
  const [vac] = await coord.post<Array<{ id: string }>>("vacancies", { requisition_id: req!.id, title: VAC, openings: 1, status: "abierta", recruiter_id: recruiter.userId });
  vacancyId = vac!.id;
  await coord.post("requirement_templates", { vacancy_id: vacancyId, requirement: `Licencia ficticia ${RUN}`, requirement_type: "obligatorio", weight: 3 });
  for (const n of ["Nadia", "Oscar", "Paula", "Quique"]) {
    candidates[n] = await coord.post<string>("rpc/save_candidate", {
      p_id: null,
      p: { first_name: n, last_name: `Kanban ${RUN}`, consent: { channel: "correo", evidence: "Prueba E2E ficticia" } },
    });
  }
});

test("coordinación: vincular, mover, descartar con motivo, contratar y límite de plazas", async ({ page, request }) => {
  await loginAs(page, "coordinador");
  await page.goto(`/vacantes/${vacancyId}/postulaciones`);
  await expect(page.getByText("Vista previa del proceso")).toBeVisible();
  for (const n of ["Nadia", "Oscar", "Paula"]) {
    await page.getByLabel("Nombre del candidato").fill(`${n} Kanban ${RUN}`);
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByRole("list", { name: "Candidatos encontrados" }).getByRole("button", { name: "Agregar al proceso" }).click();
    await expect(page.getByRole("region", { name: "Tablero de postulaciones" }).getByRole("link", { name: `${n} Kanban ${RUN}` })).toBeVisible();
  }
  const coord = await api(request, "coordinador");
  const stages = await coord.get<Array<{ name: string; category: string }>>(`vacancy_stages?vacancy_id=eq.${vacancyId}&is_active=eq.true&order=position`);
  const inProcess = stages.find((s) => s.category === "en_proceso")!.name;
  const discarded = stages.find((s) => s.category === "descartado")!.name;
  const hired = stages.find((s) => s.category === "contratado")!.name;

  // Mover con el selector accesible
  await page.getByLabel(`Mover Nadia Kanban ${RUN} a`).selectOption({ label: inProcess });
  await expect(page.getByRole("region", { name: `Etapa ${inProcess}` }).getByText(`Nadia Kanban ${RUN}`)).toBeVisible();
  // Descartar exige motivo
  await page.getByLabel(`Mover Oscar Kanban ${RUN} a`).selectOption({ label: discarded });
  await page.getByLabel("Motivo", { exact: true }).selectOption("no_cumple_requisitos");
  await page.getByLabel("Detalle (opcional)").fill("Sin licencia ficticia");
  await page.getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByRole("region", { name: `Etapa ${discarded}` }).getByText(`Oscar Kanban ${RUN}`)).toBeVisible();
  // Contratar → plaza cubierta; la segunda contratación no tiene plaza
  await page.getByLabel(`Mover Nadia Kanban ${RUN} a`).selectOption({ label: hired });
  await expect(page.getByRole("region", { name: `Etapa ${hired}` }).getByText(`Nadia Kanban ${RUN}`)).toBeVisible();
  await page.reload();
  await expect(page.getByText("1/1 cubiertas")).toBeVisible();
  await page.getByLabel(`Mover Paula Kanban ${RUN} a`).selectOption({ label: hired });
  await expect(page.getByText("La vacante no tiene plazas disponibles para contratar")).toBeVisible();

  // Ficha de la postulación: historial, observación confidencial, requisito y seguimiento
  await page.getByRole("link", { name: `Oscar Kanban ${RUN}` }).click();
  await expect(page.getByTestId("etapa-actual")).toHaveText(discarded);
  await expect(page.getByText("No cumple los requisitos — Sin licencia ficticia")).toBeVisible();
  const history = page.getByRole("list", { name: "Historial de movimientos" });
  await expect(history.getByText(new RegExp(`Cambio de etapa: .* → ${discarded}`))).toBeVisible();
  await expect(history.getByText("Motivo: no_cumple_requisitos — Sin licencia ficticia")).toBeVisible();
  await page.getByLabel("Observación", { exact: true }).fill("Observación confidencial ficticia");
  await page.getByLabel("Visibilidad").selectOption("confidencial");
  await page.getByRole("button", { name: "Agregar observación" }).click();
  await expect(page.getByRole("list", { name: "Observaciones" }).getByText("Observación confidencial ficticia")).toBeVisible();
  await page.getByLabel(`Resultado de Licencia ficticia ${RUN}`).selectOption("no_cumple");
  await page.getByRole("form", { name: `Evaluar Licencia ficticia ${RUN}` }).getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Obligatorios cumplidos: 0 de 1")).toBeVisible();
  await page.getByLabel("Calificación general").selectOption("2");
  await page.getByLabel("Próximo paso", { exact: true }).fill("Enviar agradecimiento ficticio");
  await page.getByRole("button", { name: "Guardar seguimiento" }).click();
  await expect(page.getByText("Seguimiento actualizado.")).toBeVisible();
  await expect(history.getByText("Calificación: 2")).toBeVisible();

  // Listado con filtros
  await page.goto(`/postulaciones?q=Kanban ${RUN}&etapa=descartado`);
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("desde la ficha del candidato: postular a una vacante abierta", async ({ page }) => {
  await loginAs(page, "coordinador");
  await page.goto(`/candidatos/${candidates.Quique}`);
  // La vacante de la prueba anterior quedó cubierta: se usa la vacante abierta del seed.
  const option = page.getByLabel("Vacante abierta").locator("option", { hasText: "Ejecutivo(a) de ventas corporativas" });
  await page.getByLabel("Vacante abierta").selectOption({ value: (await option.getAttribute("value"))! });
  await page.getByRole("button", { name: "Postular" }).click();
  await expect(page).toHaveURL(/\/postulaciones\/[0-9a-f-]{36}\?ok=creado$/);
  await expect(page.getByRole("heading", { level: 1, name: `Quique Kanban ${RUN}` })).toBeVisible();
});

test("reclutador asignado gestiona; consulta solo ve el tablero", async ({ page }) => {
  await loginAs(page, "reclutador");
  await page.goto(`/vacantes/${vacancyId}/postulaciones`);
  await expect(page.getByLabel(`Mover Paula Kanban ${RUN} a`)).toBeVisible();
  await page.getByRole("link", { name: `Oscar Kanban ${RUN}` }).click();
  // La observación confidencial de coordinación no es visible para el reclutador
  await expect(page.getByText("Observación confidencial ficticia")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Historial de movimientos" }).getByText("Observación confidencial")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await loginAs(page, "consulta");
  await page.goto(`/vacantes/${vacancyId}/postulaciones`);
  await expect(page.getByRole("region", { name: "Tablero de postulaciones" }).getByRole("link", { name: `Paula Kanban ${RUN}` })).toBeVisible();
  await expect(page.getByLabel(`Mover Paula Kanban ${RUN} a`)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Agregar al proceso" })).toHaveCount(0);
  await page.getByRole("link", { name: `Oscar Kanban ${RUN}` }).click();
  await expect(page.getByText("Vista de solo lectura para su rol.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Historial de movimientos" })).toHaveCount(0);
});
