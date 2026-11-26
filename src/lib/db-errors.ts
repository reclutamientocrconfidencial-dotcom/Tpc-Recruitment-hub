/**
 * Traduce errores de PostgreSQL/PostgREST a mensajes en español sin exponer
 * detalles internos (nombres de tablas, restricciones, SQL).
 */
export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

const UNIQUE_FIELD_MESSAGES: Array<[RegExp, string]> = [
  [/legal_id/i, "Ya existe un cliente con esa cédula jurídica."],
  [/intake_channels_code|code_key/i, "Ya existe una fuente con ese código."],
  [/national_id/i, "Ya existe un registro con esa identificación."],
];

/**
 * ¿Es un mensaje de regla de negocio redactado en las funciones de la BD
 * (español, sin detalles internos)? Los mensajes técnicos de PostgreSQL
 * (en inglés, con nombres de tablas o restricciones) nunca se muestran.
 */
function isBusinessMessage(message: string | null | undefined): message is string {
  if (!message || message.length > 300) return false;
  if (/violates|constraint|relation|column|null value|duplicate key|syntax|function|permission denied|operator/i.test(message)) return false;
  return /[áéíóúñ]|\b(el|la|los|las|de|del|no|se|un|una|solo|debe|ya)\b/i.test(message);
}

export function dbErrorMessage(error: DbErrorLike | null | undefined): string {
  if (!error) return "Ocurrió un error inesperado. Intente de nuevo.";
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  switch (error.code) {
    case "23505": {
      const match = UNIQUE_FIELD_MESSAGES.find(([re]) => re.test(text));
      return match ? match[1] : "Ya existe un registro con esos datos.";
    }
    case "42501":
      return "No tiene permiso para realizar esta acción.";
    case "23514":
      // Mensajes de reglas de negocio lanzados por la base de datos (ya en español).
      if (isBusinessMessage(error.message)) return error.message;
      return "Algunos datos no cumplen las reglas del sistema. Revise el formulario.";
    case "23503":
      if (isBusinessMessage(error.message)) return error.message;
      return "El registro está relacionado con otros datos y no puede modificarse así.";
    case "22P02":
    case "22023":
      return "Formato de datos inválido.";
    case "PGRST116":
      return "El registro no existe o no tiene acceso a él.";
    default:
      return "No fue posible guardar los cambios. Intente de nuevo.";
  }
}
