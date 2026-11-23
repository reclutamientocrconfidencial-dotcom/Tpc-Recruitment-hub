/** Catálogos FICTICIOS para el modo demostración (reflejan la migración 0810). */
import type { JobPosition, ProficiencyScale, RequirementCatalogItem, StageCatalogItem } from "@/types/database";

const id = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const DEMO_STAGE_CATALOG: StageCatalogItem[] = (
  [
    ["Nuevo", "nuevo", "general", 2],
    ["Preselección", "en_proceso", "general", 3],
    ["Entrevista", "en_proceso", "entrevista", 5],
    ["Entrevista con el cliente", "en_proceso", "entrevista", 5],
    ["Prueba técnica", "en_proceso", "prueba", 5],
    ["Prueba de Excel", "en_proceso", "prueba", 3],
    ["Prueba de inglés", "en_proceso", "prueba", 3],
    ["Verificación", "en_proceso", "verificacion", 3],
    ["Verificación de referencias", "en_proceso", "verificacion", 3],
    ["Validación de documentos", "en_proceso", "verificacion", 3],
    ["Oferta", "oferta", "oferta", 3],
    ["Contratado", "contratado", "general", null],
    ["Descartado", "descartado", "general", null],
    ["Retirado por el candidato", "descartado", "general", null],
  ] as const
).map(([name, category, stage_type, days], i) => ({
  id: id("99999999", i + 1),
  name,
  category,
  stage_type,
  default_target_days: days,
  description: null,
  is_active: true,
  sort_order: (i + 1) * 10,
}));

export const DEMO_JOB_POSITIONS: JobPosition[] = [
  ["Ejecutivo(a) de ventas", "Comercial"],
  ["Agente de servicio al cliente", "Servicio al cliente"],
  ["Recepcionista bilingüe", "Administración"],
  ["Asistente administrativo(a)", "Administración"],
  ["Auxiliar contable", "Finanzas"],
  ["Analista de inventarios", "Operaciones"],
  ["Bodeguero(a)", "Operaciones"],
  ["Operario(a) de producción", "Producción"],
  ["Chofer", "Logística"],
  ["Misceláneo(a)", "Servicios generales"],
].map(([name, area], i) => ({ id: id("aaaabbbb", i + 1), name: name!, area: area!, description: null, is_active: true }));

const scale = (n: number, name: string, labels: string[]): ProficiencyScale => ({
  id: id("ccccdddd", n),
  name,
  description: null,
  is_active: true,
  levels: labels.map((label, i) => ({ id: id(`ccccdd0${n}`, i + 1), scale_id: id("ccccdddd", n), position: i + 1, label, is_active: true })),
});

export const DEMO_SCALES: ProficiencyScale[] = [
  scale(1, "Idiomas (MCER)", ["A1", "A2", "B1", "B2", "C1", "C2", "Nativo"]),
  scale(2, "Dominio general", ["Básico", "Intermedio", "Avanzado", "Experto"]),
  scale(3, "Años de experiencia", ["Sin experiencia", "Menos de 1 año", "1 a 2 años", "3 a 5 años", "Más de 5 años"]),
  scale(4, "Cumplimiento", ["Cumple"]),
];

export const DEMO_REQUIREMENT_CATALOG: RequirementCatalogItem[] = (
  [
    ["Inglés", "idioma", 1],
    ["Microsoft Excel", "habilidad", 2],
    ["SAP", "habilidad", 2],
    ["Experiencia en ventas", "experiencia", 3],
    ["Experiencia en servicio al cliente", "experiencia", 3],
    ["Bachillerato en educación media", "formacion", 4],
    ["Licencia de conducir B1", "certificacion", 4],
    ["Carné de manipulación de alimentos", "certificacion", 4],
    ["Disponibilidad para turnos rotativos", "disponibilidad", 4],
  ] as const
).map(([name, category, s], i) => ({
  id: id("eeeeffff", i + 1),
  name,
  category,
  scale_id: id("ccccdddd", s),
  description: null,
  is_active: true,
}));
