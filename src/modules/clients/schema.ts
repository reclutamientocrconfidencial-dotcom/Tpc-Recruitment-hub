import { z } from "zod";
import { CLIENT_STATUSES, CR_PROVINCES } from "@/types/database";
import { normalizeEmail, normalizeLegalId, normalizePhone } from "@/lib/normalize";

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

/** Validación del formulario de clientes (navegador y servidor). */
export const clientSchema = z.object({
  name: z.string().trim().min(2, "Ingrese el nombre de la empresa.").max(200, "Nombre: máximo 200 caracteres."),
  legal_id: z
    .string()
    .trim()
    .max(30, "Cédula jurídica demasiado larga.")
    .transform(normalizeLegalId)
    .refine((v) => v === "" || /^[0-9A-Z-]{5,30}$/.test(v), "Cédula jurídica inválida (ej.: 3-101-123456).")
    .transform((v) => (v === "" ? null : v)),
  industry: optionalText(100, "Industria"),
  status: z.enum(CLIENT_STATUSES, { error: "Seleccione un estado válido." }),
  contact_name: optionalText(150, "Contacto"),
  contact_email: z
    .string()
    .trim()
    .max(200)
    .transform(normalizeEmail)
    .refine((v) => v === "" || z.email().safeParse(v).success, "Correo electrónico inválido.")
    .transform((v) => (v === "" ? null : v)),
  contact_phone: z
    .string()
    .trim()
    .max(30, "Teléfono demasiado largo.")
    .refine((v) => v === "" || /^[+\d\s()-]{8,30}$/.test(v), "Teléfono inválido (ej.: 2222-3333).")
    .transform((v) => (v === "" ? null : normalizePhone(v))),
  province: z
    .union([z.enum(CR_PROVINCES), z.literal("")], { error: "Seleccione una provincia válida." })
    .transform((v) => (v === "" ? null : v)),
  address: optionalText(300, "Dirección"),
  notes: optionalText(2000, "Observaciones"),
  account_manager_id: z
    .union([z.uuid(), z.literal("")], { error: "Gestor de cuenta inválido." })
    .transform((v) => (v === "" ? null : v)),
});

export type ClientInput = z.output<typeof clientSchema>;

export const CLIENT_FORM_FIELDS = [
  "name",
  "legal_id",
  "industry",
  "status",
  "contact_name",
  "contact_email",
  "contact_phone",
  "province",
  "address",
  "notes",
  "account_manager_id",
] as const;

export function parseClientForm(formData: FormData) {
  const raw = Object.fromEntries(CLIENT_FORM_FIELDS.map((k) => [k, String(formData.get(k) ?? "")]));
  return clientSchema.safeParse(raw);
}
