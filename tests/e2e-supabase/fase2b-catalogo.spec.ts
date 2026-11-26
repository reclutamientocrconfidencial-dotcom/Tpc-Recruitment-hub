import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORD, USERS, env, type UserKey } from "./fixtures";

/** Edición del catálogo de requisitos (migración 0830): propagación, historial, escala y permisos. */
const RUN = Date.now().toString().slice(-6);
const NAME = `Excel ficticio ${RUN}`;
const RENAMED = `Excel avanzado ficticio ${RUN}`;
const CLIENT_3 = "11111111-0000-4000-8000-000000000003";

async function loginAs(page: Page, user: UserKey) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(USERS[user].email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** API REST con la sesión del usuario indicado (aplica RLS). */
async function rest(request: APIRequestContext, user: UserKey) {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY");
  const token = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key },
    data: { email: USERS[user].email, password: PASSWORD },
  });
  const { access_token } = (await token.json()) as { access_token: string };
  return { url: `${url}/rest/v1`, headers: { apikey: key, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" } };
}

test.afterAll(async ({ request }) => {
  const { url, headers } = await rest(request, "admin");
  const { data } = { data: (await (await request.get(`${url}/requirement_catalog?select=id&name=like.*${RUN}*`, { headers })).json()) as Array<{ id: string }> };
  for (const r of data) await request.delete(`${url}/requirement_templates?catalog_requirement_id=eq.${r.id}`, { headers });
});

test("coordinación: edita nombre, categoría y escala; se propaga y queda en el historial", async ({ page, request }) => {
  await loginAs(page, "coordinador");
  const api = await rest(request, "coordinador");

  // 1) Requisito nuevo con escala «Dominio general»
  await page.goto("/administracion/catalogos/requisitos");
  const create = page.getByRole("form", { name: "Nuevo requisito del catálogo" });
  await create.locator("#rc-name").fill(NAME);
  await create.locator("#rc-scale").selectOption({ label: "Dominio general" });
  await page.getByRole("button", { name: "Agregar requisito" }).click();
  await expect(page.getByText(`Requisito «${NAME}» agregado.`)).toBeVisible();

  // 2) Un cliente lo usa (sin nivel mínimo)
  const cat = (await (await request.get(`${api.url}/requirement_catalog?select=id&name=eq.${encodeURIComponent(NAME)}`, { headers: api.headers })).json()) as Array<{ id: string }>;
  const reqId = cat[0]!.id;
  const ins = await request.post(`${api.url}/requirement_templates`, {
    headers: api.headers,
    data: { client_id: CLIENT_3, catalog_requirement_id: reqId, requirement: "x", requirement_type: "deseable", weight: 2 },
  });
  expect(ins.ok()).toBe(true);

  // 3) Editar nombre y categoría
  await page.reload();
  await page.getByRole("link", { name: `Editar requisito ${NAME}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Editar: ${NAME}` })).toBeVisible();
  await expect(page.getByText("1 requisito(s) configurado(s)", { exact: false })).toBeVisible();
  await page.getByLabel("Nombre del requisito").fill(RENAMED);
  await page.getByLabel("Categoría").selectOption("formacion");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText(`Requisito «${RENAMED}» actualizado.`)).toBeVisible();
  const history = page.getByRole("list", { name: "Historial de cambios" });
  await expect(history.getByText(`Nombre: «${NAME}» → «${RENAMED}»`)).toBeVisible();
  await expect(history.getByText("Categoría: Habilidad → Formación")).toBeVisible();
  await expect(history.getByText("1 requisito(s) configurado(s) actualizado(s)", { exact: false })).toBeVisible();
  await expect(history.getByText(USERS.coordinador.name, { exact: false })).toBeVisible();

  // El requisito configurado del cliente muestra el nuevo nombre y categoría (verificado en la BD)
  const tpl = (await (await request.get(`${api.url}/requirement_templates?select=requirement,category&catalog_requirement_id=eq.${reqId}`, { headers: api.headers })).json()) as Array<{ requirement: string; category: string }>;
  expect(tpl).toEqual([{ requirement: RENAMED, category: "formacion" }]);

  // 4) Cambio de escala (nadie exige nivel todavía)
  await page.getByLabel("Escala de dominio").selectOption({ label: "Cumplimiento" });
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText(`Requisito «${RENAMED}» actualizado.`)).toBeVisible();
  await expect(history.getByText("Escala: Dominio general → Cumplimiento")).toBeVisible();

  // 5) Con un nivel mínimo configurado, la escala queda bloqueada
  const level = (await (await request.get(`${api.url}/proficiency_levels?select=id,scale:proficiency_scales!inner(name)&scale.name=eq.Cumplimiento&label=eq.Cumple`, { headers: api.headers })).json()) as Array<{ id: string }>;
  const withLevel = await request.post(`${api.url}/requirement_templates`, {
    headers: api.headers,
    data: { catalog_requirement_id: reqId, min_level_id: level[0]!.id, requirement: "x", requirement_type: "obligatorio", weight: 3 },
  });
  expect(withLevel.ok()).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Escala de dominio")).toBeDisabled();
  await expect(page.getByText("Para cambiar la escala, quite primero el nivel mínimo")).toBeVisible();
  // Y la base de datos lo impide aunque se intente por la API
  const blocked = await request.patch(`${api.url}/requirement_catalog?id=eq.${reqId}`, { headers: api.headers, data: { scale_id: null } });
  expect(blocked.ok()).toBe(false);
  // El historial no se puede escribir desde la API
  const forged = await request.post(`${api.url}/requirement_catalog_history`, { headers: api.headers, data: { requirement_id: reqId, new_name: "falso" } });
  expect(forged.ok()).toBe(false);
});

test("reclutador y consulta: sin edición del catálogo ni acceso al historial", async ({ page, request }) => {
  for (const user of ["reclutador", "consulta"] as const) {
    await loginAs(page, user);
    const api = await rest(request, user);
    const cat = (await (await request.get(`${api.url}/requirement_catalog?select=id&limit=1`, { headers: api.headers })).json()) as Array<{ id: string }>;
    await page.goto(`/administracion/catalogos/requisitos/${cat[0]!.id}`);
    await expect(page.getByText("Solo administración y coordinación pueden editar el catálogo de requisitos.")).toBeVisible();
    const res = await request.patch(`${api.url}/requirement_catalog?id=eq.${cat[0]!.id}`, {
      headers: { ...api.headers, Prefer: "return=representation" },
      data: { name: "Cambio no autorizado" },
    });
    expect(await res.json()).toEqual([]); // RLS: 0 filas
    const hist = (await (await request.get(`${api.url}/requirement_catalog_history?select=id`, { headers: api.headers })).json()) as unknown[];
    expect(hist).toEqual([]);
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    // Esperar a que termine el cierre de sesión antes de iniciar la siguiente (evita una carrera intermitente)
    await expect(page).toHaveURL(/\/login$/);
  }
});
