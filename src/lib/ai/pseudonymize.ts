/**
 * Seudonimización antes de enviar texto a un proveedor de IA (Ley 8968,
 * minimización). Reemplaza los identificadores conocidos de la persona y,
 * además, cualquier patrón de correo, teléfono, identificación o enlace.
 * Los marcadores se pueden revertir en el servidor al aplicar un resultado.
 */
export const MARKERS = {
  name: "[CANDIDATO]",
  email: "[CORREO]",
  phone: "[TELEFONO]",
  id: "[IDENTIFICACION]",
  url: "[ENLACE]",
} as const;

export interface Identifiers {
  names?: Array<string | null | undefined>;
  emails?: Array<string | null | undefined>;
  phones?: Array<string | null | undefined>;
  ids?: Array<string | null | undefined>;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Variante sin tildes para encontrar el nombre aunque el texto no las use. */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function pseudonymize(text: string, who: Identifiers = {}): { text: string; replacements: number } {
  let out = text;
  let replacements = 0;
  const sub = (re: RegExp, marker: string) => {
    out = out.replace(re, () => {
      replacements++;
      return marker;
    });
  };
  // 1) Correos y enlaces primero (contienen partes del nombre)
  for (const e of who.emails ?? []) if (e?.trim()) sub(new RegExp(escapeRe(e.trim()), "gi"), MARKERS.email);
  sub(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, MARKERS.email);
  sub(/\bhttps?:\/\/\S+|\bwww\.\S+|\blinkedin\.com\/\S+/gi, MARKERS.url);
  // 2) Identificación y teléfonos conocidos (con o sin separadores)
  for (const id of who.ids ?? []) {
    const digits = (id ?? "").replace(/\D/g, "");
    if (digits.length >= 4) sub(new RegExp(digits.split("").join("[\\s.-]?"), "g"), MARKERS.id);
  }
  for (const p of who.phones ?? []) {
    const digits = (p ?? "").replace(/\D/g, "").replace(/^506(?=\d{8}$)/, "");
    if (digits.length >= 8) sub(new RegExp(`(\\+?506[\\s.-]?)?${digits.split("").join("[\\s.-]?")}`, "g"), MARKERS.phone);
  }
  // 3) Nombre completo y cada parte de 3+ letras (con y sin tildes)
  const names = (who.names ?? []).filter((n): n is string => Boolean(n && n.trim()));
  const fullNames = names.map((n) => n.trim()).sort((a, b) => b.length - a.length);
  const parts = [...new Set(fullNames.flatMap((n) => n.split(/\s+/)).filter((p) => p.length >= 3))].sort((a, b) => b.length - a.length);
  for (const n of [...fullNames, ...parts]) {
    for (const variant of new Set([n, fold(n)])) sub(new RegExp(`(?<![\\p{L}])${escapeRe(variant)}(?![\\p{L}])`, "giu"), MARKERS.name);
  }
  // 4) Patrones genéricos de identificación y teléfono
  sub(/(?<!\d)\d{1}[\s-]\d{4}[\s-]\d{4}(?!\d)|(?<!\d)\d{9,12}(?!\d)/g, MARKERS.id);
  sub(/(\+?506[\s.-]?)?(?<!\d)[2-8]\d{3}[\s.-]?\d{4}(?!\d)/g, MARKERS.phone);
  return { text: out, replacements };
}

/** Revierte el marcador del nombre (solo en el servidor, al aplicar un resultado revisado). */
export function reidentify(text: string, name: string): string {
  return text.split(MARKERS.name).join(name);
}

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
