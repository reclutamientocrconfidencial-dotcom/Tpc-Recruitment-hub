/**
 * Salvaguardas de contenido para entrevistas: ninguna pregunta (de la IA,
 * del banco o escrita a mano) puede indagar características personales
 * ajenas a las competencias laborales (Ley 8968, Código de Trabajo y
 * principios de no discriminación).
 */
const PATTERNS: Array<[RegExp, string]> = [
  [/\bedad\b|cu[aá]ntos a[nñ]os tiene|a[nñ]o de nacimiento|fecha de nacimiento/i, "edad"],
  [/estado civil|\bcasad[oa]\b|\bsolter[oa]\b|divorciad|\bpareja\b|\bnovi[oa]\b|\bc[oó]nyuge\b/i, "estado civil"],
  [/\bhij[oa]s?\b|embaraz|planea tener|maternidad|paternidad|qui[eé]n cuida/i, "familia o embarazo"],
  [/religi[oó]n|\biglesia\b|creencia|\bcreyente\b/i, "religión"],
  [/orientaci[oó]n sexual|homosexual|heterosexual|\bgay\b|lesbiana|identidad de g[eé]nero/i, "orientación sexual o identidad de género"],
  [/\bsalud\b|enfermedad|discapacidad|padecimiento|medicamento|\bVIH\b|incapacidad m[eé]dica/i, "salud o discapacidad"],
  [/nacionalidad de sus padres|origen [eé]tnico|\braza\b|color de piel|ind[ií]gena|de d[oó]nde son sus padres/i, "origen o etnia"],
  [/partido pol[ií]tico|por qui[eé]n vot|sindicat|afiliaci[oó]n pol[ií]tica/i, "afiliación política o sindical"],
  [/antecedentes penales de su familia|\bpeso\b|\bestatura\b|apariencia f[ií]sica/i, "características físicas o familiares"],
];

/** Devuelve el motivo si el texto toca un tema prohibido; null si es aceptable. */
export function discriminatoryReason(text: string): string | null {
  for (const [re, reason] of PATTERNS) if (re.test(text)) return reason;
  return null;
}

/** Normaliza para detectar preguntas repetidas (sin tildes, signos ni mayúsculas). */
export function questionKey(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** Filtra preguntas discriminatorias y repetidas; informa cuántas se omitieron. */
export function screenQuestions<T extends { texto: string }>(items: T[], existing: string[] = []): { kept: T[]; removed: Array<{ texto: string; motivo: string }> } {
  const seen = new Set(existing.map(questionKey));
  const kept: T[] = [];
  const removed: Array<{ texto: string; motivo: string }> = [];
  for (const q of items) {
    const reason = discriminatoryReason(q.texto);
    const key = questionKey(q.texto);
    if (reason) removed.push({ texto: q.texto, motivo: `tema no permitido (${reason})` });
    else if (!key || seen.has(key)) removed.push({ texto: q.texto, motivo: "repetida" });
    else {
      seen.add(key);
      kept.push(q);
    }
  }
  return { kept, removed };
}
