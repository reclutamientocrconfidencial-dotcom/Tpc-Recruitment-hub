import { readFileSync } from "node:fs";
import { parseCvText } from "@/lib/cv/parse";
import type { ReportInput } from "@/lib/report/compose";

/** Informes de muestra con datos 100 % ficticios para los cuatro tipos de perfil. */
const base = {
  header: "The People Outsourcing Company S.A. · Informe ejecutivo de candidato",
  footer:
    "Documento confidencial. Contiene datos personales tratados conforme a la Ley N.° 8968. Uso exclusivo del cliente para el proceso indicado; prohibida su reproducción o distribución.",
  templateVersion: "2026-2",
  title: "Informe ejecutivo de candidato",
  reportVersion: 1,
  finalizedAt: "26/11/2026",
  finalizedBy: "Reclutadora Ficticia",
  recruiter: "Reclutadora Ficticia",
  templateSections: [],
};
const cv = (n: string) => parseCvText(readFileSync(`tests/fixtures/cv/${n}.txt`, "utf8"));
const answers = (xs: Array<[string, number]>) => xs.map(([competency, rating]) => ({ competency, rating }));

export const SAMPLES: Record<"operativo" | "administrativo" | "tecnico" | "comercial", ReportInput> = {
  operativo: {
    ...base,
    candidate: { name: "Marco Antonio Vargas Ficticio", currentTitle: "Operario de bodega", years: 9, english: "A1" },
    vacancy: { code: "VAC-2026-00101", title: "Operario(a) de bodega", position: "Operario de bodega", client: "Distribuidora Cliente Ficticio S.A.", location: "Alajuela", modality: "Presencial", schedule: "Rotativo 6 x 1" },
    recommendation: "recomendado",
    content: {
      resumen_ejecutivo: "Operario con nueve años de experiencia en recepción, despacho e inventarios, certificado en montacargas y con licencia B1 vigente. Mostró orden, conocimiento de seguridad ocupacional y disposición para turnos rotativos.",
      evidencias_entrevista: "Describió el procedimiento de conteo cíclico que aplicó y que redujo diferencias de inventario en 15 %.\nExplicó con precisión la inspección previa al uso del montacargas.",
      fortalezas: "Experiencia comprobable en operación de montacargas\nDisciplina en procedimientos de seguridad\nDisponibilidad inmediata para turnos rotativos",
      aspectos_por_validar: "Confirmar referencias de Distribuidora Ficticia del Valle\nVerificar vigencia del carné de montacargas",
      disponibilidad: "Disponible a partir del 1 de diciembre. Acepta horario rotativo. Reside a 20 minutos del centro de distribución.",
      conclusion: "Cumple los requisitos obligatorios y demostró dominio práctico de la operación. Se recomienda avanzar a la entrevista con el cliente.",
    },
    cv: cv("operativo"),
    requirements: [
      { name: "Licencia de montacargas vigente", type: "obligatorio", status: "cumple", level: null, note: "Carné verificado; vence en 2027." },
      { name: "Experiencia mínima de 2 años en bodega", type: "obligatorio", status: "cumple", level: null, note: "Nueve años según CV y referencias." },
      { name: "Bachillerato en Educación Media", type: "obligatorio", status: "cumple", level: null, note: "Título presentado." },
      { name: "Manejo de sistema de inventarios", type: "deseable", status: "pendiente", level: null, note: "Declarado; validar en prueba de campo." },
    ],
    assessments: [
      { name: "Prueba de campo: montacargas", kind: "campo", requirement: "obligatoria", status: "aprobada", normalized: 90, detail: "90 de 100", criteria: [], notes: null },
      { name: "Verificación de referencias", kind: "referencias", requirement: "deseable", status: "pendiente", normalized: null, detail: "", criteria: [], notes: null },
    ],
    weightedScore: 90,
    interviews: [{ date: "20/11/2026", kind: "Presencial", interviewer: "Reclutadora Ficticia", rating: 4, recommendation: "Recomendado", answers: answers([["Seguridad ocupacional", 5], ["Trabajo en equipo", 4], ["Orden y disciplina", 4], ["Comunicación", 3]]) }],
  },
  administrativo: {
    ...base,
    candidate: { name: "Laura Patricia Mora Ficticia", currentTitle: "Asistente administrativa", years: 7, english: "B1" },
    vacancy: { code: "VAC-2026-00102", title: "Asistente contable", position: "Asistente contable", client: "Servicios Cliente Ficticio S.A.", location: "San José", modality: "Híbrida", schedule: "Lunes a viernes, 8:00 a 17:00" },
    recommendation: "con_reservas",
    content: {
      resumen_ejecutivo: "Asistente administrativa con experiencia en conciliaciones, cuentas por pagar y facturación electrónica. Excel avanzado comprobado en prueba. El nivel de inglés es inferior al deseable para el puesto.",
      evidencias_entrevista: "Explicó la conciliación bancaria mensual paso a paso, incluyendo partidas en tránsito.\nMostró el control de pagos en Excel que redujo atrasos en 30 %.",
      fortalezas: "Dominio de Excel (tablas dinámicas y BUSCARV)\nExperiencia en facturación electrónica\nOrden documental",
      aspectos_por_validar: "Nivel de inglés para correspondencia (B1 frente a B2 deseable)\nExperiencia con cierres contables completos",
      disponibilidad: "Disponible con 2 semanas de preaviso. Acepta modalidad híbrida.",
      conclusion: "Perfil sólido en lo operativo-contable. Se recomienda con reservas por la brecha de inglés, que el cliente debe valorar según el uso real del idioma en el puesto.",
    },
    cv: cv("administrativo"),
    requirements: [
      { name: "Bachillerato universitario en Administración o Contabilidad", type: "obligatorio", status: "cumple", level: null, note: "Título verificado." },
      { name: "Excel avanzado", type: "obligatorio", status: "cumple", level: "Avanzado", note: "Prueba aprobada con 88/100." },
      { name: "Facturación electrónica", type: "obligatorio", status: "cumple", level: null, note: "Certificación 2020." },
      { name: "Inglés B2", type: "deseable", status: "no_cumple", level: "B1", note: "Prueba de inglés: B1." },
    ],
    assessments: [
      { name: "Prueba de Excel", kind: "excel", requirement: "obligatoria", status: "aprobada", normalized: 88, detail: "88 de 100", criteria: [], notes: null },
      { name: "Prueba de inglés", kind: "ingles", requirement: "deseable", status: "aprobada", normalized: 42.9, detail: "Nivel B1", criteria: [], notes: null },
      { name: "Entrevista por competencias", kind: "entrevista", requirement: "obligatoria", status: "aprobada", normalized: 75, detail: "", criteria: [{ name: "Orientación al detalle", score: 5, weight: 1 }, { name: "Organización", score: 4, weight: 1 }], notes: null },
    ],
    weightedScore: 72.5,
    interviews: [{ date: "21/11/2026", kind: "Virtual", interviewer: "Reclutadora Ficticia", rating: 4, recommendation: "Recomendado con reservas", answers: answers([["Orientación al detalle", 5], ["Comunicación escrita", 4], ["Organización", 4], ["Resolución de problemas", 3]]) }],
  },
  tecnico: {
    ...base,
    candidate: { name: "Diego Alonso Rojas Ficticio", currentTitle: "Técnico de mantenimiento", years: 11, english: null },
    vacancy: { code: "VAC-2026-00103", title: "Técnico(a) de mantenimiento industrial", position: "Técnico de mantenimiento", client: "Manufacturas Cliente Ficticio S.A.", location: "Cartago", modality: "Presencial", schedule: "Turno A" },
    recommendation: "recomendado",
    content: {
      resumen_ejecutivo: "Técnico electromecánico con once años de experiencia en mantenimiento preventivo y correctivo, tableros eléctricos y variadores. Resolvió el caso práctico de diagnóstico con un plan estructurado.",
      evidencias_entrevista: "Relató la implementación de un plan preventivo que redujo paros no programados en 20 %.",
      casos_practicos: "Caso: falla intermitente en banda transportadora. Identificó la causa probable (sensor inductivo) y propuso verificación segura con bloqueo y etiquetado.",
      fortalezas: "Diagnóstico eléctrico estructurado\nCultura de seguridad (NFPA 70E, trabajo en alturas)",
      aspectos_por_validar: "Experiencia con PLC más allá del nivel básico",
      disponibilidad: "Disponible de inmediato. Acepta turno A y guardias según rol.",
      conclusion: "Cumple con holgura los requisitos técnicos y de seguridad. Se recomienda presentarlo al cliente.",
    },
    cv: cv("tecnico"),
    requirements: [
      { name: "Diplomado en Electromecánica o afín", type: "obligatorio", status: "cumple", level: null, note: "Título verificado." },
      { name: "3 años en mantenimiento industrial", type: "obligatorio", status: "cumple", level: null, note: "Más de 8 años en el área." },
      { name: "Trabajo en alturas", type: "obligatorio", status: "cumple", level: null, note: "Certificado 2022." },
      { name: "PLC intermedio", type: "deseable", status: "pendiente", level: null, note: "Declara nivel básico." },
    ],
    assessments: [
      { name: "Prueba técnica de electricidad", kind: "tecnica", requirement: "obligatoria", status: "aprobada", normalized: 84, detail: "84 de 100", criteria: [], notes: null },
      { name: "Caso práctico", kind: "caso_practico", requirement: "obligatoria", status: "aprobada", normalized: 86.7, detail: "", criteria: [{ name: "Análisis", score: 5, weight: 2 }, { name: "Propuesta de solución", score: 4, weight: 2 }, { name: "Presentación", score: 4, weight: 1 }], notes: "Aplicó bloqueo y etiquetado." },
    ],
    weightedScore: 85.3,
    interviews: [{ date: "22/11/2026", kind: "Presencial", interviewer: "Reclutadora Ficticia", rating: 5, recommendation: "Recomendado", answers: answers([["Conocimiento técnico", 5], ["Seguridad", 5], ["Resolución de problemas", 4], ["Trabajo en equipo", 4]]) }],
  },
  comercial: {
    ...base,
    candidate: { name: "Sofía Elena Jiménez Ficticia", currentTitle: "Ejecutiva de cuentas corporativas", years: 9, english: "C1" },
    vacancy: { code: "VAC-2026-00104", title: "Ejecutivo(a) comercial B2B", position: "Ejecutivo de ventas", client: "Soluciones Cliente Ficticio S.A.", location: "Heredia", modality: "Híbrida", schedule: "Lunes a viernes" },
    recommendation: "no_recomendado",
    content: {
      resumen_ejecutivo: "Ejecutiva B2B con cartera corporativa y manejo de Salesforce. Superó metas en su puesto actual. Sus pretensiones de movilidad no coinciden con la cobertura geográfica requerida por el cliente.",
      evidencias_entrevista: "Superó la meta anual en 18 % (2023) con 45 cuentas.\nDescribió su embudo de prospección en Salesforce.",
      fortalezas: "Negociación consultiva\nInglés avanzado (C1)",
      aspectos_por_validar: "Disponibilidad para visitas en zona norte (requisito del cliente)",
      disponibilidad: "Disponible con un mes de preaviso. No cuenta con vehículo propio para giras.",
      conclusion: "Perfil comercial fuerte, pero no cumple el requisito obligatorio de vehículo propio para giras. No se recomienda para esta vacante; se sugiere considerarla en procesos sin giras.",
    },
    cv: cv("comercial"),
    requirements: [
      { name: "Experiencia de 3 años en ventas B2B", type: "obligatorio", status: "cumple", level: null, note: "Desde 2020 en cuentas corporativas." },
      { name: "Vehículo propio para giras", type: "obligatorio", status: "no_cumple", level: null, note: "Confirmado en entrevista." },
      { name: "Inglés B2", type: "deseable", status: "cumple", level: "C1", note: "Prueba: C1." },
      { name: "Manejo de CRM", type: "deseable", status: "cumple", level: null, note: "Salesforce." },
    ],
    assessments: [
      { name: "Prueba de inglés", kind: "ingles", requirement: "deseable", status: "aprobada", normalized: 71.4, detail: "Nivel C1", criteria: [], notes: null },
      { name: "Juego de roles comercial", kind: "assessment_center", requirement: "obligatoria", status: "aprobada", normalized: 80, detail: "80 de 100", criteria: [], notes: null },
    ],
    weightedScore: 77.1,
    interviews: [{ date: "23/11/2026", kind: "Virtual", interviewer: "Reclutadora Ficticia", rating: 4, recommendation: "No recomendado", answers: answers([["Negociación", 5], ["Orientación a resultados", 5], ["Comunicación", 4], ["Planificación", 3]]) }],
  },
};
