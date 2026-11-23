import type { ZodError } from "zod";

/** Estado que devuelven las Server Actions de formularios. */
export interface ActionState {
  ok?: boolean;
  message?: string | null;
  error?: string | null;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

export const INITIAL_ACTION_STATE: ActionState = {};

export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Valores enviados (solo texto) para repoblar el formulario tras un error. */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  }
  return out;
}

export const DEMO_READ_ONLY = "Modo demostración: los cambios no se guardan.";
