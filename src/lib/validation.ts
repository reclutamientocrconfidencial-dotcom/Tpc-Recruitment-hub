import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string({ error: "Ingrese su correo electrónico." })
    .trim()
    .toLowerCase()
    .min(1, "Ingrese su correo electrónico.")
    .pipe(z.email("Ingrese un correo electrónico válido.")),
  password: z
    .string({ error: "Ingrese su contraseña." })
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(128, "La contraseña es demasiado larga."),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Evita redirecciones abiertas: solo rutas internas relativas. */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.startsWith("/login")) return fallback;
  return value;
}
