#!/usr/bin/env node
// Genera un CSV de candidatos 100 % FICTICIOS con el formato de la plantilla de importación.
// Uso: node scripts/generar-candidatos-ficticios.mjs [cantidad=2700] > candidatos-ficticios.csv
// - Correos *@correo.test, cédulas que inician con 0 y teléfonos 0000-xxxx: no existen en Costa Rica.
// - Incluye errores y duplicados intencionales (≈2 %) para ensayar el informe de validación.
const total = Number(process.argv[2] ?? 2700);
let seed = 20261125;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const nombres = ["Ana", "Luis", "María", "José", "Carla", "Diego", "Elena", "Fabián", "Gabriela", "Hernán", "Irene", "Jorge", "Karla", "Leonel", "Mónica", "Néstor", "Olga", "Pablo", "Rocío", "Sergio", "Tatiana", "Ulises", "Valeria", "Wálter", "Ximena", "Yolanda", "Zacarías"];
const apellidos = ["Ficticio", "Inventado", "Simulado", "Ejemplo", "Prueba", "Demo", "Muestra", "Ensayo", "Modelo", "Imaginario"];
const ubic = [["San José", "Escazú"], ["San José", "Desamparados"], ["Alajuela", "Grecia"], ["Alajuela", "San Carlos"], ["Cartago", "La Unión"], ["Heredia", "Belén"], ["Heredia", "Sarapiquí"], ["Guanacaste", "Liberia"], ["Puntarenas", "Garabito"], ["Limón", "Pococí"]];
const puestos = ["Ejecutivo(a) de ventas", "Bodeguero(a)", "Recepcionista bilingüe", "Analista de inventarios", "Cajero(a)", "Agente de servicio al cliente", "Chofer"];
const fuentes = ["WhatsApp", "Correo electrónico", "LinkedIn", "Facebook", "Feria de empleo", "Referencia"];
const cell = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const rows = [["nombre", "apellidos", "telefono", "correo", "provincia", "canton", "distrito", "localidad", "puesto", "fuente", "detalle_fuente", "cedula"]];
for (let i = 1; i <= total; i++) {
  const [prov, canton] = pick(ubic);
  const n = pick(nombres);
  const a = `${pick(apellidos)} ${pick(apellidos)}`;
  const id = String(i).padStart(4, "0");
  let row = [n, a, `0000-${id}`, `candidato${id}@correo.test`, prov, canton, `Distrito ${1 + (i % 5)}`, "Barrio ficticio", pick(puestos), pick(fuentes), "", `0-${String(100 + (i % 900)).padStart(4, "0")}-${id}`];
  if (i % 97 === 0) row[3] = "correo-invalido"; // error
  if (i % 131 === 0) row[0] = ""; // error: sin nombre
  if (i % 151 === 0 && i > 1) row[3] = `candidato${String(i - 1).padStart(4, "0")}@correo.test`; // duplicado en el archivo
  if (i % 173 === 0) row[4] = "Atlántida"; // provincia inválida
  rows.push(row);
}
process.stdout.write("﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n");
