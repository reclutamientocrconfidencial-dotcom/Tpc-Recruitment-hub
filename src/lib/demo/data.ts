/**
 * Datos 100 % FICTICIOS para el modo demostración y las pruebas.
 * Coinciden con supabase/seed.sql. Ninguna persona o empresa es real.
 */
import type {
  Application,
  Candidate,
  Client,
  DashboardMetrics,
  IntakeChannel,
  PipelineTemplate,
  Profile,
  RequirementTemplate,
  Requisition,
  Vacancy,
} from "@/types/database";

export const DEMO_CREDENTIALS = { email: "demo@tpc-demo.test", password: "DemoTPC2026" } as const;

export const DEMO_PROFILE: Profile = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  email: DEMO_CREDENTIALS.email,
  full_name: "Usuaria Demo",
  role: "admin",
  is_active: true,
};

const now = new Date("2026-11-20T15:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

export const DEMO_CLIENTS: Client[] = [
  { id: "11111111-0000-4000-8000-000000000001", name: "Comercializadora Ficticia del Valle S.A.", legal_id: "3-101-000001", industry: "Comercio", status: "activo", contact_name: "Ana Prueba Solís", contact_email: "ana.prueba@valle-ficticio.test", contact_phone: "+506 2000-0001", province: "San José", created_at: daysAgo(60) },
  { id: "11111111-0000-4000-8000-000000000002", name: "Logística Imaginaria CR S.R.L.", legal_id: "3-102-000002", industry: "Logística", status: "activo", contact_name: "Luis Ejemplo Mora", contact_email: "luis.ejemplo@logistica-imaginaria.test", contact_phone: "+506 2000-0002", province: "Heredia", created_at: daysAgo(40) },
  { id: "11111111-0000-4000-8000-000000000003", name: "Servicios Demo Guanacaste S.A.", legal_id: "3-101-000003", industry: "Turismo", status: "prospecto", contact_name: "María Muestra Vargas", contact_email: "maria.muestra@demo-gte.test", contact_phone: "+506 2000-0003", province: "Guanacaste", created_at: daysAgo(10) },
];

const clientRef = (i: number) => {
  const c = DEMO_CLIENTS[i]!;
  return { id: c.id, name: c.name };
};

export const DEMO_REQUISITIONS: Requisition[] = [
  { id: "22222222-0000-4000-8000-000000000001", code: "REQ-2026-00001", client_id: DEMO_CLIENTS[0]!.id, title: "Ejecutivo(a) de ventas", department: "Comercial", positions_count: 3, priority: "alta", status: "en_proceso", salary_min: 600000, salary_max: 850000, currency: "CRC", target_date: "2026-12-20", created_at: daysAgo(20), client: clientRef(0) },
  { id: "22222222-0000-4000-8000-000000000002", code: "REQ-2026-00002", client_id: DEMO_CLIENTS[1]!.id, title: "Analista de inventarios", department: "Operaciones", positions_count: 1, priority: "media", status: "aprobada", salary_min: 750000, salary_max: 950000, currency: "CRC", target_date: "2027-01-05", created_at: daysAgo(12), client: clientRef(1) },
  { id: "22222222-0000-4000-8000-000000000003", code: "REQ-2026-00003", client_id: DEMO_CLIENTS[2]!.id, title: "Recepcionista bilingüe", department: "Hospedaje", positions_count: 2, priority: "urgente", status: "pendiente_aprobacion", salary_min: 1200, salary_max: 1500, currency: "USD", target_date: "2026-12-05", created_at: daysAgo(3), client: clientRef(2) },
];

export const DEMO_VACANCIES: Vacancy[] = [
  { id: "33333333-0000-4000-8000-000000000001", code: "VAC-2026-00001", requisition_id: DEMO_REQUISITIONS[0]!.id, title: "Ejecutivo(a) de ventas corporativas", province: "San José", modality: "hibrido", employment_type: "tiempo_completo", status: "abierta", openings: 3, salary_min: 600000, salary_max: 850000, currency: "CRC", published_at: daysAgo(5), closes_at: "2026-12-15", created_at: daysAgo(6), requisition: { id: DEMO_REQUISITIONS[0]!.id, code: "REQ-2026-00001", client: clientRef(0) } },
  { id: "33333333-0000-4000-8000-000000000002", code: "VAC-2026-00002", requisition_id: DEMO_REQUISITIONS[1]!.id, title: "Analista de inventarios", province: "Heredia", modality: "presencial", employment_type: "tiempo_completo", status: "borrador", openings: 1, salary_min: 750000, salary_max: 950000, currency: "CRC", published_at: null, closes_at: null, created_at: daysAgo(2), requisition: { id: DEMO_REQUISITIONS[1]!.id, code: "REQ-2026-00002", client: clientRef(1) } },
];

export const DEMO_CANDIDATES: Candidate[] = [
  { id: "44444444-0000-4000-8000-000000000001", first_name: "Carlos", last_name: "Ficticio Rojas", email: "carlos.ficticio@correo.test", phone: "+506 8000-0001", province: "San José", current_title: "Asesor comercial", years_experience: 4, english_level: "B2", source: "Referido", consent_given: true, created_at: daysAgo(8) },
  { id: "44444444-0000-4000-8000-000000000002", first_name: "Daniela", last_name: "Inventada Castro", email: "daniela.inventada@correo.test", phone: "+506 8000-0002", province: "Heredia", current_title: "Analista de logística", years_experience: 6, english_level: "C1", source: "Portal de empleo", consent_given: true, created_at: daysAgo(6) },
  { id: "44444444-0000-4000-8000-000000000003", first_name: "Esteban", last_name: "Simulado Jiménez", email: "esteban.simulado@correo.test", phone: "+506 8000-0003", province: "Alajuela", current_title: "Vendedor", years_experience: 2, english_level: "B1", source: "LinkedIn", consent_given: true, created_at: daysAgo(4) },
];

const candRef = (i: number) => {
  const c = DEMO_CANDIDATES[i]!;
  return { id: c.id, first_name: c.first_name, last_name: c.last_name };
};
const vacRef = (i: number) => {
  const v = DEMO_VACANCIES[i]!;
  return { id: v.id, code: v.code, title: v.title };
};

export const DEMO_APPLICATIONS: Application[] = [
  { id: "55555555-0000-4000-8000-000000000001", vacancy_id: DEMO_VACANCIES[0]!.id, candidate_id: DEMO_CANDIDATES[0]!.id, stage: "entrevista", rating: 4, applied_at: daysAgo(4), stage_changed_at: daysAgo(1), candidate: candRef(0), vacancy: vacRef(0) },
  { id: "55555555-0000-4000-8000-000000000002", vacancy_id: DEMO_VACANCIES[0]!.id, candidate_id: DEMO_CANDIDATES[2]!.id, stage: "preseleccion", rating: 3, applied_at: daysAgo(3), stage_changed_at: daysAgo(2), candidate: candRef(2), vacancy: vacRef(0) },
];

export const DEMO_METRICS: DashboardMetrics = {
  active_clients: DEMO_CLIENTS.filter((c) => c.status === "activo").length,
  open_requisitions: DEMO_REQUISITIONS.filter((r) => ["pendiente_aprobacion", "aprobada", "en_proceso"].includes(r.status)).length,
  open_vacancies: DEMO_VACANCIES.filter((v) => v.status === "abierta").length,
  total_candidates: DEMO_CANDIDATES.length,
  active_applications: DEMO_APPLICATIONS.filter((a) => !["contratado", "descartado", "retirado"].includes(a.stage)).length,
  hires_this_month: 0,
};

// ---------------------------- Fase 2A (demostración) ----------------------------

export const DEMO_INTAKE_CHANNELS: IntakeChannel[] = [
  ["whatsapp", "WhatsApp", "whatsapp", null, 10],
  ["correo", "Correo electrónico", "correo", null, 20],
  ["linkedin", "LinkedIn", "redes_sociales", null, 30],
  ["facebook", "Facebook", "redes_sociales", null, 31],
  ["instagram", "Instagram", "redes_sociales", null, 32],
  ["tiktok", "TikTok", "redes_sociales", null, 33],
  ["red_social_otra", "Otra red social", "redes_sociales", "Nombre de la red social", 39],
  ["plataforma_empleo", "Plataforma de empleo", "plataforma_empleo", "Nombre de la plataforma", 40],
  ["feria_empleo", "Feria de empleo", "feria_empleo", "Nombre y fecha de la feria", 50],
  ["formulario_web", "Formulario web", "formulario", null, 60],
  ["referencia", "Referencia", "referencia", "Persona que refiere", 70],
  ["otro", "Otro", "otro", "Detalle", 99],
].map(([code, name, category, detail_label, sort_order], i) => ({
  id: `66666666-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  code: code as string,
  name: name as string,
  category: category as IntakeChannel["category"],
  detail_label: detail_label as string | null,
  is_active: true,
  sort_order: sort_order as number,
}));

export const DEMO_GLOBAL_PIPELINE: PipelineTemplate = {
  id: "77777777-0000-4000-8000-000000000001",
  client_id: null,
  name: "Proceso estándar TPC",
  description: "Plantilla global utilizada cuando el cliente no tiene una propia.",
  is_default: true,
  stages: [
    { position: 1, name: "Nuevo", category: "nuevo", stage_type: "general", target_days: 2 },
    { position: 2, name: "Preselección", category: "en_proceso", stage_type: "general", target_days: 3 },
    { position: 3, name: "Entrevista", category: "en_proceso", stage_type: "entrevista", target_days: 5 },
    { position: 4, name: "Prueba técnica", category: "en_proceso", stage_type: "prueba", target_days: 5 },
    { position: 5, name: "Verificación", category: "en_proceso", stage_type: "verificacion", target_days: 3 },
    { position: 6, name: "Oferta", category: "oferta", stage_type: "oferta", target_days: 3 },
    { position: 7, name: "Contratado", category: "contratado", stage_type: "general", target_days: null },
    { position: 8, name: "Descartado", category: "descartado", stage_type: "general", target_days: null },
  ],
};

export const DEMO_REQUIREMENTS: RequirementTemplate[] = [
  {
    id: "88888888-0000-4000-8000-000000000001",
    client_id: "11111111-0000-4000-8000-000000000001",
    position_title: "Ejecutivo(a) de ventas",
    requirement: "Experiencia en ventas corporativas",
    requirement_type: "obligatorio",
    category: "experiencia",
    expected_level: "2 años o más",
    weight: 4,
    is_active: true,
  },
];
