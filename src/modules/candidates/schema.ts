import { z } from "zod";
import { CONSENT_CHANNELS, CR_PROVINCES, CURRENCIES, ENGLISH_LEVELS, NATIONAL_ID_TYPES, type CrProvince } from "@/types/database";

const text = (max: number, label: string) =>
  z.string().trim().max(max, `${label}: máximo ${max} caracteres.`).optional().transform((v) => (v ? v : null));
const uuidOrEmpty = z.union([z.uuid(), z.literal("")], { error: "Selección inválida." }).optional().transform((v) => (v ? v : null));
const PHONE_RE = /^\+?[0-9\s()-]{8,20}$/;

/** Ficha del candidato, en el orden acordado (1–9) más los datos complementarios. */
export const candidateSchema = z.object({
  // 1. Nombre completo
  first_name: z.string().trim().min(1, "Indique el nombre.").max(100, "Nombre: máximo 100 caracteres."),
  last_name: z.string().trim().min(1, "Indique los apellidos.").max(150, "Apellidos: máximo 150 caracteres."),
  // 2. Teléfono
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .refine((v) => !v || PHONE_RE.test(v), "Teléfono inválido (ej.: 8888-8888 o +506 8888-8888).")
    .transform((v) => (v ? v : null)),
  phone_alt: z
    .string()
    .trim()
    .max(30)
    .optional()
    .refine((v) => !v || PHONE_RE.test(v), "Teléfono inválido.")
    .transform((v) => (v ? v : null)),
  // 3. Correo
  email: z
    .union([z.literal(""), z.email({ error: "Correo inválido." }).max(200)])
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null)),
  // 4–7. Ubicación
  province: z
    .union([z.enum(CR_PROVINCES), z.literal("")], { error: "Provincia inválida." })
    .optional()
    .transform((v) => (v ? v : null)),
  canton: text(80, "Cantón"),
  district: text(100, "Distrito"),
  locality: text(150, "Localidad"),
  // 8. Perfiles profesionales (puestos del catálogo)
  position_ids: z.array(z.uuid()).max(10, "Máximo 10 perfiles.").default([]),
  primary_position_id: uuidOrEmpty,
  // 9. Fuente
  intake_channel_id: uuidOrEmpty,
  source_detail: text(150, "Detalle de la fuente"),
  // Complementarios
  national_id_type: z
    .union([z.enum(NATIONAL_ID_TYPES), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  national_id: text(30, "Identificación"),
  current_title: text(150, "Puesto actual"),
  years_experience: z
    .union([z.literal(""), z.coerce.number({ error: "Años inválidos." }).min(0, "Mínimo 0.").max(70, "Máximo 70.")])
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
  english_level: z
    .union([z.enum(ENGLISH_LEVELS), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  expected_salary: z
    .union([z.literal(""), z.coerce.number({ error: "Monto inválido." }).min(0, "No puede ser negativo.").max(1e10)])
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
  salary_currency: z.enum(CURRENCIES).default("CRC"),
  confidential_notes: text(4000, "Notas confidenciales"),
  owner_id: uuidOrEmpty,
});
export type CandidateInput = z.output<typeof candidateSchema>;

export const consentSchema = z.object({
  consent_given: z.literal("on", { error: "Confirme que el candidato otorgó su consentimiento informado." }),
  consent_channel: z.enum(CONSENT_CHANNELS, { error: "Indique cómo se obtuvo el consentimiento." }),
  consent_evidence: text(300, "Evidencia"),
});

/** Convierte el FormData del formulario de candidato en datos para la validación. */
export function candidateFormInput(formData: FormData): Record<string, unknown> {
  const entries = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string"));
  return { ...entries, position_ids: formData.getAll("position_ids").filter((v): v is string => typeof v === "string" && v !== "") };
}

// ---------------------------------------------------------------------
// Importación: columnas de la plantilla (en el orden de la ficha)
// ---------------------------------------------------------------------
export const IMPORT_COLUMNS = [
  { key: "first_name", header: "nombre", label: "Nombre", required: true },
  { key: "last_name", header: "apellidos", label: "Apellidos", required: true },
  { key: "phone", header: "telefono", label: "Teléfono" },
  { key: "email", header: "correo", label: "Correo electrónico" },
  { key: "province", header: "provincia", label: "Provincia" },
  { key: "canton", header: "canton", label: "Cantón" },
  { key: "district", header: "distrito", label: "Distrito" },
  { key: "locality", header: "localidad", label: "Localidad" },
  { key: "position", header: "puesto", label: "Puesto o perfil profesional" },
  { key: "source", header: "fuente", label: "Fuente de recepción" },
  { key: "source_detail", header: "detalle_fuente", label: "Detalle de la fuente" },
  { key: "national_id", header: "cedula", label: "Cédula / identificación (opcional)" },
] as const;
export type ImportKey = (typeof IMPORT_COLUMNS)[number]["key"];
export const MAX_IMPORT_ROWS = 5000;
export const IMPORT_CHUNK = 500;

/** Quita tildes y pasa a minúsculas para comparar encabezados y nombres. */
export function fold(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function matchProvince(v: string): CrProvince | null {
  const f = fold(v);
  return CR_PROVINCES.find((p) => fold(p) === f) ?? null;
}

/** Asigna las columnas del archivo a las de la plantilla (por encabezado, sin tildes ni mayúsculas). */
export function mapHeaders(headers: string[]): { map: Partial<Record<ImportKey, number>>; missing: string[] } {
  const folded = headers.map((h) => fold(h).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  const aliases: Partial<Record<ImportKey, string[]>> = {
    first_name: ["nombre", "nombres"],
    last_name: ["apellidos", "apellido"],
    phone: ["telefono", "celular", "tel"],
    email: ["correo", "correo_electronico", "email", "e_mail"],
    national_id: ["cedula", "identificacion", "cedula_identificacion"],
    position: ["puesto", "perfil", "puesto_o_perfil_profesional", "perfil_profesional"],
    source: ["fuente", "fuente_de_recepcion"],
    source_detail: ["detalle_fuente", "detalle_de_la_fuente"],
  };
  const map: Partial<Record<ImportKey, number>> = {};
  for (const col of IMPORT_COLUMNS) {
    const names = aliases[col.key] ?? [col.header];
    const idx = folded.findIndex((h) => names.includes(h));
    if (idx >= 0) map[col.key] = idx;
  }
  const missing = IMPORT_COLUMNS.filter((c) => "required" in c && c.required && map[c.key] === undefined).map((c) => c.label);
  return { map, missing };
}

export interface ImportRowInput {
  row_number: number;
  values: Partial<Record<ImportKey, string>>;
}

export interface NormalizedImportRow {
  row_number: number;
  data: Record<string, string>;
  errors: string[];
}

/**
 * Valida y normaliza una fila (se ejecuta en el servidor antes de guardarla).
 * Los cantones y fuentes se validan contra los catálogos.
 */
export function normalizeImportRow(
  row: ImportRowInput,
  catalogs: { cantons: Array<{ province: string; name: string }>; channels: Array<{ id: string; name: string }> },
): NormalizedImportRow {
  const v = (k: ImportKey) => (row.values[k] ?? "").toString().trim();
  const errors: string[] = [];
  const data: Record<string, string> = {};
  const first = v("first_name");
  const last = v("last_name");
  if (!first) errors.push("Nombre: obligatorio.");
  if (!last) errors.push("Apellidos: obligatorio.");
  if (first.length > 100) errors.push("Nombre: máximo 100 caracteres.");
  if (last.length > 150) errors.push("Apellidos: máximo 150 caracteres.");
  data.first_name = first;
  data.last_name = last;

  const phone = v("phone");
  if (phone) {
    if (!PHONE_RE.test(phone)) errors.push("Teléfono inválido.");
    else data.phone = phone;
  }
  const email = v("email").toLowerCase();
  if (email) {
    if (!z.email().safeParse(email).success || email.length > 200) errors.push("Correo inválido.");
    else data.email = email;
  }
  const provinceRaw = v("province");
  let province: CrProvince | null = null;
  if (provinceRaw) {
    province = matchProvince(provinceRaw);
    if (!province) errors.push(`Provincia desconocida: «${provinceRaw}».`);
    else data.province = province;
  }
  const cantonRaw = v("canton");
  if (cantonRaw) {
    const found = catalogs.cantons.find((c) => fold(c.name) === fold(cantonRaw) && (!province || c.province === province));
    if (!found) errors.push(`Cantón desconocido${province ? ` en ${province}` : ""}: «${cantonRaw}».`);
    else {
      data.canton = found.name;
      if (!province) data.province = found.province;
    }
  }
  for (const k of ["district", "locality", "source_detail"] as const) {
    const val = v(k);
    if (val.length > 150) errors.push(`${IMPORT_COLUMNS.find((c) => c.key === k)!.label}: máximo 150 caracteres.`);
    else if (val) data[k] = val;
  }
  const position = v("position");
  if (position.length > 150) errors.push("Puesto: máximo 150 caracteres.");
  else if (position) data.position = position;
  const source = v("source");
  if (source) {
    const ch = catalogs.channels.find((c) => fold(c.name) === fold(source));
    if (!ch) errors.push(`Fuente desconocida: «${source}» (use un nombre del catálogo de fuentes).`);
    else data.intake_channel_id = ch.id;
  }
  const nid = v("national_id");
  if (nid) {
    if (nid.length > 30 || !/^[0-9A-Za-z\s-]+$/.test(nid)) errors.push("Identificación inválida.");
    else {
      data.national_id = nid;
      data.national_id_type = /^\d[\d\s-]*$/.test(nid) ? "cedula" : "otro";
    }
  }
  return { row_number: row.row_number, data, errors };
}

export const importBatchSchema = z.object({
  file_name: z.string().trim().min(1).max(200),
  consent_text_id: z.uuid({ error: "Seleccione la versión del consentimiento." }),
  consent_channel: z.enum(CONSENT_CHANNELS, { error: "Indique cómo otorgaron el consentimiento." }),
  consent_evidence: z.string().trim().min(5, "Describa la evidencia del consentimiento (mínimo 5 caracteres).").max(300),
  reason: z.string().trim().min(5, "Indique el motivo de la importación (mínimo 5 caracteres).").max(300),
  consent_confirm: z.literal("on", { error: "Confirme que todas las personas del archivo otorgaron su consentimiento." }),
});
