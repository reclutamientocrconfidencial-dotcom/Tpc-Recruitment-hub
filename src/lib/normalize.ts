/** Normalización de datos de contacto (Costa Rica). */

/** Teléfono a formato legible; 8 dígitos se asumen de Costa Rica (+506). */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 8) return `+506 ${digits.slice(0, 4)}-${digits.slice(4)}`;
  if (digits.length === 11 && digits.startsWith("506")) return `+506 ${digits.slice(3, 7)}-${digits.slice(7)}`;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/** Teléfono en formato E.164 (para comparar duplicados). */
export function phoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 8) return `+506${digits}`;
  return `+${digits}`;
}

/**
 * Cédula jurídica: 10 dígitos → formato oficial X-XXX-XXXXXX.
 * Otros formatos (empresas extranjeras) se conservan en mayúsculas sin espacios.
 */
export function normalizeLegalId(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10 && /^[\d\s-]+$/.test(trimmed)) {
    return `${digits.slice(0, 1)}-${digits.slice(1, 4)}-${digits.slice(4)}`;
  }
  return trimmed.replace(/\s+/g, "");
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
