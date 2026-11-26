import { z } from "zod";

/** Código de 6 dígitos de la aplicación autenticadora (se ignoran espacios). */
export const totpCodeSchema = z
  .string({ error: "Ingrese el código de 6 dígitos." })
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos."));

export const factorNameSchema = z
  .string()
  .trim()
  .max(40, "Nombre: máximo 40 caracteres.")
  .optional()
  .transform((v) => (v ? v : "Aplicación autenticadora"));

/** Minutos de inactividad antes de cerrar la sesión automáticamente. */
export const IDLE_TIMEOUT_MINUTES = 30;

export const ACCESS_ACTIONS = ["ver_dato_sensible", "descargar", "exportar", "importar"] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];
