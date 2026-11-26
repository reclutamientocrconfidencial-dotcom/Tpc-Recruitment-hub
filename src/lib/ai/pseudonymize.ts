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

function isYearRange(a: string, b: string): boolean {
  const x = Number(a);
  const y = Number(b);
  return x >= 1950 && x <= 2039 && y >= x && y <= 2039;
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
  const parts = [...new Set(fullNames.flatMap((n) => n.split(/\s+/)).filter((p) => p.length >= 3 && /\p{L}/u.test(p)))].sort((a, b) => b.length - a.length);
  for (const n of fullNames) {
    for (const variant of new Set([n, fold(n)])) sub(new RegExp(`(?<![\\p{L}])${escapeRe(variant)}(?![\\p{L}])`, "giu"), MARKERS.name);
  }
  // Cada parte del nombre por separado solo con mayúscula inicial o todo en mayúsculas (como se escribe un nombre):
  // así un apellido que también es palabra común («Mora», «Contable») no borra «mora» o «asistente contable».
  for (const n of parts) {
    const cap = (x: string) => x.charAt(0).toLocaleUpperCase("es") + x.slice(1).toLocaleLowerCase("es");
    for (const variant of new Set([cap(n), cap(fold(n)), n.toLocaleUpperCase("es"), fold(n).toLocaleUpperCase("es")])) {
      sub(new RegExp(`(?<![\\p{L}])${escapeRe(variant)}(?![\\p{L}])`, "gu"), MARKERS.name);
    }
  }
  // 4) Patrones genéricos de identificación y teléfono
  sub(/(?<!\d)\d{1}[\s-]\d{4}[\s-]\d{4}(?!\d)|(?<!\d)\d{9,12}(?!\d)/g, MARKERS.id);
  // Un período laboral «2015-2019» no es un teléfono: se conserva (los teléfonos conocidos ya se reemplazaron arriba).
  out = out.replace(/(\+?506[\s.-]?)?(?<!\d)([2-8]\d{3})([\s.-]?)(\d{4})(?!\d)/g, (m, cc: string | undefined, a: string, sep: string, b: string) => {
    if (!cc && sep && isYearRange(a, b)) return m;
    replacements++;
    return MARKERS.phone;
  });
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
