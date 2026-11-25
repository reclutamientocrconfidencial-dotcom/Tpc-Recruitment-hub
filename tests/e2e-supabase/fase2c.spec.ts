import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, USERS, type UserKey } from "./fixtures";

/** Fase 2C: base madre de candidatos (ficha, datos sensibles, duplicados, importación). */
const RUN = Date.now().toString().slice(-6);

async function loginAs(page: Page, user: UserKey) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(USERS[user].email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function fillCandidate(page: Page, d: { first: string; last: string; phone?: string; email?: string; cedula?: string }) {
  await page.getByLabel("1. Nombre").fill(d.first);
  await page.getByLabel("Apellidos").fill(d.last);
  if (d.phone) await page.getByLabel("2. Teléfono").fill(d.phone);
  if (d.email) await page.getByLabel("3. Correo electrónico").fill(d.email);
  if (d.cedula) {
    await page.getByLabel("Tipo de identificación").selectOption("cedula");
    await page.getByLabel("Número de identificación").fill(d.cedula);
  }
}

test("coordinación: ficha completa con consentimiento, perfiles y revisión de duplicados", async ({ page }) => {
  await loginAs(page, "coordinador");
  await page.goto("/candidatos/nuevo");
  await fillCandidate(page, { first: "Rebeca", last: `Ficticia ${RUN}`, phone: `0000-${RUN.slice(-4)}`, email: `rebeca.${RUN}@correo.test`, cedula: `0-9${RUN.slice(0, 3)}-${RUN.slice(3)}` });
  await page.getByLabel("4. Provincia").selectOption("Heredia");
  await page.getByLabel("5. Cantón").selectOption("Belén");
  await page.getByLabel("6. Distrito").fill("La Ribera");
  await page.getByLabel("7. Localidad").fill("Barrio ficticio");
  await page.getByRole("combobox", { name: "Agregar perfil del catálogo" }).fill("Bodeg");
  await page.getByRole("option", { name: /^Bodeguero\(a\)/ }).click();
  await page.getByRole("combobox", { name: "Agregar perfil del catálogo" }).fill("Chofer");
  await page.getByRole("option", { name: /^Chofer/ }).click();
  await page.getByLabel("9. Fuente").selectOption({ label: "WhatsApp" });
  // Sin consentimiento no se registra
  await page.getByRole("button", { name: "Registrar candidato" }).click();
  await expect(page.getByText("Confirme que el candidato otorgó su consentimiento informado.")).toBeVisible();
  await page.getByLabel("El candidato leyó y aceptó este consentimiento.").check();
  await page.getByLabel("¿Cómo lo otorgó?").selectOption("formulario_fisico");
  await page.getByLabel("Evidencia").fill("Formulario ficticio");
  await page.getByRole("button", { name: "Registrar candidato" }).click();
  await expect(page.getByText("Registro creado correctamente.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: `Rebeca Ficticia ${RUN}` })).toBeVisible();
  await expect(page.getByText(`rebeca.${RUN}@correo.test`)).toBeVisible();
  await expect(page.getByText("Bodeguero(a) (principal) · Chofer")).toBeVisible();
  await expect(page.getByText("Esta consulta de datos sensibles quedó registrada.")).toBeVisible();
  await expect(page.getByText("Versión 2026-1-BORRADOR · Formulario físico firmado")).toBeVisible();
  const fichaUrl = page.url();

  // Mismo correo con otro nombre: posible duplicado → confirmación humana
  await page.goto("/candidatos/nuevo");
  await fillCandidate(page, { first: "Otra", last: `Persona ${RUN}`, email: `REBECA.${RUN}@correo.test` });
  await page.getByLabel("El candidato leyó y aceptó este consentimiento.").check();
  await page.getByLabel("¿Cómo lo otorgó?").selectOption("correo");
  await page.getByRole("button", { name: "Registrar candidato" }).click();
  await expect(page.getByRole("region", { name: "Posibles duplicados" }).getByText(`Rebeca Ficticia ${RUN}`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Posibles duplicados" })).toContainText("coincide en: correo");
  await page.getByLabel("Revisé las coincidencias: se trata de otra persona.").check();
  await page.getByRole("button", { name: "Registrar candidato" }).click();
  await expect(page.getByText("Registro creado correctamente.")).toBeVisible();

  // Misma cédula: bloqueo
  await page.goto("/candidatos/nuevo");
  await fillCandidate(page, { first: "Tercera", last: `Persona ${RUN}`, cedula: `0 9${RUN.slice(0, 3)} ${RUN.slice(3)}` });
  await page.getByLabel("El candidato leyó y aceptó este consentimiento.").check();
  await page.getByLabel("¿Cómo lo otorgó?").selectOption("correo");
  await page.getByRole("button", { name: "Registrar candidato" }).click();
  await expect(page.getByText(`La identificación ya está registrada para Rebeca Ficticia ${RUN}.`)).toBeVisible();

  // Búsqueda avanzada por perfil y por dato de contacto
  await page.goto(`/candidatos?q=${RUN}&provincia=Heredia`);
  await expect(page.getByRole("link", { name: `Rebeca Ficticia ${RUN}` })).toBeVisible();
  await page.getByLabel("Buscar por cédula, correo o teléfono").fill(`+506 0000 ${RUN.slice(-4)}`);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByRole("status").getByRole("link", { name: `Rebeca Ficticia ${RUN}` })).toBeVisible();

  // Revocación del consentimiento → no contactar
  await page.goto(fichaUrl);
  await page.getByLabel("Motivo de la revocación").fill("Solicitud ficticia");
  await page.getByRole("button", { name: "Revocar" }).click();
  await expect(page.getByText("Sin consentimiento vigente: no contactar a esta persona.")).toBeVisible();
});

test("consulta: ve la ficha general pero no los datos sensibles", async ({ page }) => {
  await loginAs(page, "consulta");
  await page.goto("/candidatos/44444444-0000-4000-8000-000000000001");
  await expect(page.getByRole("heading", { level: 1, name: "Carlos Ficticio Rojas" })).toBeVisible();
  await expect(page.getByText("Restringido para su rol").first()).toBeVisible();
  await expect(page.getByText("carlos.ficticio@correo.test")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
  await page.goto("/candidatos/nuevo");
  await expect(page.getByText("Su rol no permite registrar candidatos.")).toBeVisible();
  await page.goto("/candidatos/importar");
  await expect(page.getByText("Solo administración y coordinación importan candidatos.")).toBeVisible();
});

test("importación: validación, revisión humana de duplicados, importación y reversión", async ({ page }) => {
  await loginAs(page, "coordinador");
  await page.goto("/candidatos/importar");
  const csv = [
    "nombre,apellidos,telefono,correo,provincia,canton,distrito,localidad,puesto,fuente,detalle_fuente,cedula",
    `Sofía,Importada ${RUN},0001-${RUN.slice(-4)},sofia.${RUN}@correo.test,Limón,Pococí,Guápiles,Centro,Bodeguero(a),WhatsApp,,`,
    `,Sin Nombre ${RUN},,,,,,,,,,`,
    `Carlos,Repetido ${RUN},,,,,,,,,,0-0000-0001`,
    `Daniela,Similar ${RUN},+506 8000-0002,,,,,,,,,`,
  ].join("\n");
  await page.getByLabel("Archivo de candidatos").setInputFiles({ name: `prueba-${RUN}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText(`4 filas en «prueba-${RUN}.csv».`)).toBeVisible();
  await page.getByLabel("¿Cómo otorgaron el consentimiento?").selectOption("importacion");
  await page.getByLabel("Evidencia").fill("Formularios ficticios archivados");
  await page.getByLabel("Motivo de la importación").fill("Prueba automatizada ficticia");
  await page.getByLabel(/Declaro que todas las personas/).check();
  await page.getByRole("button", { name: "3. Validar archivo" }).click();
  await expect(page).toHaveURL(/\/candidatos\/importar\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("conteo-valido")).toHaveText("1");
  await expect(page.getByTestId("conteo-error")).toHaveText("1");
  await expect(page.getByTestId("conteo-duplicado")).toHaveText("1");
  await expect(page.getByTestId("conteo-posible_duplicado")).toHaveText("1");
  await expect(page.getByText("Faltan 1 decisión(es).")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Importar ahora" }).click();
  await expect(page.getByText("Revise todos los posibles duplicados antes de importar")).toBeVisible();

  await page.getByRole("link", { name: "Revisar" }).click();
  await page.getByLabel("Decisión fila 5").selectOption("crear");
  await page.getByRole("form", { name: "Decisión para la fila 5" }).getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("form", { name: "Decisión para la fila 5" }).getByText("✓")).toBeVisible();
  await page.reload();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Importar ahora" }).click();
  await expect(page.getByText(/Importado el .*: 2 creados, 0 actualizados, 2 omitidos\. Los datos del archivo\s+se eliminaron del lote/)).toBeVisible();
  const batchUrl = page.url().split("?")[0]!;
  await page.goto(batchUrl);
  await expect(page.getByRole("link", { name: `Sofía Importada ${RUN}` })).toBeVisible();

  // Solo administración revierte
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await loginAs(page, "admin");
  await page.goto(batchUrl);
  await page.getByLabel("Motivo").fill("Limpieza de la prueba automatizada");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revertir lote" }).click();
  await expect(page.getByText(/Lote revertido el .*: 2 candidato\(s\) eliminados/)).toBeVisible();
  await page.goto("/administracion/bitacora?tipo=accesos&recurso=candidatos");
  await expect(page.getByRole("row", { name: /Importación.*candidatos.*Prueba automatizada ficticia · 2 registro/ }).first()).toBeVisible();
});

test("ensayo de importación masiva: 2.700 candidatos ficticios", async ({ page }) => {
  test.setTimeout(240_000);
  const csv = execFileSync("node", ["scripts/generar-candidatos-ficticios.mjs", "2700"]);
  await loginAs(page, "coordinador");
  await page.goto("/candidatos/importar");
  await page.getByLabel("Archivo de candidatos").setInputFiles({ name: `ensayo-2700-${RUN}.csv`, mimeType: "text/csv", buffer: csv });
  await expect(page.getByText(new RegExp(`2.700 filas en «ensayo-2700-${RUN}\\.csv»`))).toBeVisible();
  await page.getByLabel("¿Cómo otorgaron el consentimiento?").selectOption("importacion");
  await page.getByLabel("Evidencia").fill("Ensayo con datos ficticios");
  await page.getByLabel("Motivo de la importación").fill("Ensayo de importación masiva (S1/2C)");
  await page.getByLabel(/Declaro que todas las personas/).check();
  const started = Date.now();
  await page.getByRole("button", { name: "3. Validar archivo" }).click();
  await expect(page).toHaveURL(/\/candidatos\/importar\/[0-9a-f-]{36}$/, { timeout: 180_000 });
  const validated = Date.now();
  const errors = Number(await page.getByTestId("conteo-error").textContent());
  const valid = Number(await page.getByTestId("conteo-valido").textContent());
  expect(errors).toBeGreaterThan(40); // errores intencionales del generador
  expect(valid + errors).toBe(2700);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Importar ahora" }).click();
  await expect(page.getByText(new RegExp(`Importado el .*: ${valid} creados, 0 actualizados, ${errors} omitidos`))).toBeVisible({ timeout: 180_000 });
  console.log(`[ensayo 2.700] validación ${Math.round((validated - started) / 1000)} s · importación ${Math.round((Date.now() - validated) / 1000)} s · ${valid} creados, ${errors} con errores`);
  const batchUrl = page.url();
  // Limpieza: el administrador revierte el ensayo
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await loginAs(page, "admin");
  await page.goto(batchUrl);
  await page.getByLabel("Motivo").fill("Fin del ensayo de importación");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revertir lote" }).click();
  await expect(page.getByText(new RegExp(`Lote revertido el .*: ${valid} candidato\\(s\\) eliminados`))).toBeVisible({ timeout: 120_000 });
});
