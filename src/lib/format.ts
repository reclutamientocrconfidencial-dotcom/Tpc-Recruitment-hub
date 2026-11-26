import type { CurrencyCode } from "@/types/database";

const LOCALE = "es-CR";
const TIME_ZONE = "America/Costa_Rica";

export function formatCurrency(amount: number | null | undefined, currency: CurrencyCode = "CRC"): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "CRC" ? 0 : 2,
  }).format(amount);
}

export function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: CurrencyCode = "CRC",
): string {
  if (min == null && max == null) return "A convenir";
  if (min != null && max != null) return `${formatCurrency(min, currency)} – ${formatCurrency(max, currency)}`;
  return min != null ? `Desde ${formatCurrency(min, currency)}` : `Hasta ${formatCurrency(max, currency)}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", year: "numeric", timeZone: TIME_ZONE }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIME_ZONE }).format(date);
}

export function fullName(person: { first_name: string; last_name: string } | null | undefined): string {
  if (!person) return "—";
  return `${person.first_name} ${person.last_name}`.trim();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
