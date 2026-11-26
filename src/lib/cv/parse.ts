import { EMPTY_PROFILE, type CvProfile } from "@/lib/cv/profile";

/**
 * Analizador de currículums por reglas (sin IA). Reconoce los apartados
 * habituales en español, los períodos laborales y los idiomas con nivel.
 * Sirve como proveedor simulado y como punto de partida editable; nunca
 * inventa datos: lo que no reconoce queda vacío para completarlo a mano.
 */
type SectionKey = "perfil" | "experiencia" | "formacion" | "habilidades" | "idiomas" | "certificaciones" | "licencias" | "referencias";
const HEADINGS: Array<[SectionKey, RegExp]> = [
  ["perfil", /^(perfil( profesional)?|resumen( profesional)?|acerca de m[ií]|objetivo( profesional)?)\s*:?$/i],
  ["experiencia", /^(experiencia( laboral| profesional)?|trayectoria( laboral| profesional)?|historial laboral)\s*:?$/i],
  ["formacion", /^(formaci[oó]n( acad[eé]mica)?|educaci[oó]n|estudios( realizados)?)\s*:?$/i],
  ["habilidades", /^(habilidades( t[eé]cnicas)?|competencias( t[eé]cnicas)?|herramientas|conocimientos( t[eé]cnicos)?|skills)\s*:?$/i],
  ["idiomas", /^(idiomas?|lenguas)\s*:?$/i],
  ["certificaciones", /^(certificaciones|cursos( y certificaciones)?|capacitaciones)\s*:?$/i],
  ["licencias", /^(licencias?( de conducir)?)\s*:?$/i],
  ["referencias", /^(referencias( laborales| personales)?)\s*:?$/i],
];

const MONTHS: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12 };
const PERIOD = /((?:(?:ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)[a-z]*\.?\s+)?(?:\d{1,2}\/)?(?:19|20)\d{2})\s*(?:-|–|—|a|al|hasta)\s*((?:(?:ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)[a-z]*\.?\s+)?(?:\d{1,2}\/)?(?:19|20)\d{2}|actual(?:idad|mente)?|presente|la fecha|hoy)/i;
const BULLET = /^\s*(?:[•●▪◦\-–*·]|\d+[.)])\s+/;
const LEVELS: Array<[RegExp, string]> = [
  [/\b(C2|nativ[oa]|lengua materna|biling[uü]e)\b/i, "C2"],
  [/\bC1\b|avanzad[oa]|fluid[oa]/i, "C1"],
  [/\bB2\b|intermedio[ -]alto|intermedio avanzado/i, "B2"],
  [/\bB1\b|intermedi[oa]/i, "B1"],
  [/\bA2\b|b[aá]sico[ -]alto/i, "A2"],
  [/\bA1\b|b[aá]sic[oa]|elemental/i, "A1"],
];
const LANGS = ["Inglés", "Español", "Francés", "Portugués", "Alemán", "Italiano", "Mandarín", "Chino", "Japonés"];
const SKILL_WORDS = [
  "Excel", "Word", "PowerPoint", "Power BI", "SAP", "Oracle", "SQL", "Python", "Java", "JavaScript", "Salesforce", "CRM", "ERP", "AutoCAD",
  "Office", "Outlook", "Tableau", "QuickBooks", "Odoo", "Linux", "Redes", "Contabilidad", "Inventarios", "Logística", "Ventas", "Servicio al cliente",
  "Atención al cliente", "Negociación", "Liderazgo", "Trabajo en equipo", "Montacargas", "Soldadura", "Electricidad", "Mantenimiento", "HACCP", "BPM",
];

function parseDate(s: string, end: boolean): Date | null {
  const t = s.toLowerCase().trim();
  if (/actual|presente|fecha|hoy/.test(t)) return new Date();
  const y = t.match(/(19|20)\d{2}/)?.[0];
  if (!y) return null;
  const mName = t.match(/(ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)/)?.[1];
  const mNum = t.match(/(\d{1,2})\//)?.[1];
  const m = mName ? MONTHS[mName]! : mNum ? Math.min(Math.max(Number(mNum), 1), 12) : end ? 12 : 1;
  // El fin de un período cuenta el mes completo (primer día del mes siguiente).
  return new Date(Date.UTC(Number(y), end ? m : m - 1, 1));
}

/** Años de experiencia: suma de períodos sin contar dos veces los que se superponen. */
export function totalYears(periods: Array<{ desde: string; hasta: string }>): number {
  const ranges = periods
    .map((p) => [parseDate(p.desde, false), parseDate(p.hasta, true)] as const)
    .filter((r): r is readonly [Date, Date] => Boolean(r[0] && r[1] && r[1] >= r[0]))
    .map(([a, b]) => [a.getTime(), b.getTime()] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const r of ranges) {
    if (!cur || r[0] > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [r[0], r[1]];
    } else cur[1] = Math.max(cur[1], r[1]);
  }
  if (cur) total += cur[1] - cur[0];
  return Math.round((total / (365.25 * 86_400_000)) * 10) / 10;
}

function splitSections(lines: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = { encabezado: [] };
  let current = "encabezado";
  for (const line of lines) {
    const clean = line.trim();
    const heading = HEADINGS.find(([, re]) => re.test(clean));
    if (heading && clean.length < 60) {
      current = heading[0];
      out[current] ??= [];
      continue;
    }
    if (clean) (out[current] ??= []).push(clean);
  }
  return out;
}

/** Separa «Cargo - Empresa» o «Título, Institución». «en» solo se usa como último recurso (y nunca en formación: «Técnico en Logística»). */
function splitHead(text: string, allowEn: boolean): [string, string] {
  for (const re of [/\s+[-–—|·]\s+/, /,\s+/]) {
    const i = text.search(re);
    if (i > 0) {
      const m = text.slice(i).match(re)![0];
      return [text.slice(0, i).trim(), text.slice(i + m.length).trim()];
    }
  }
  if (allowEn) {
    const m = text.match(/^(.{3,60}?)\s+en\s+([A-ZÁÉÍÓÚÑ].*)$/);
    if (m) return [m[1]!.trim(), m[2]!.trim()];
  }
  return [text.trim(), ""];
}

function parseExperience(lines: string[]): CvProfile["experiencia"] {
  const jobs: CvProfile["experiencia"] = [];
  let job: CvProfile["experiencia"][number] | null = null;
  let pendingTitle: string | null = null;
  for (const line of lines) {
    const period = line.match(PERIOD);
    if (period) {
      const rest = line.replace(PERIOD, "").replace(/[()|,;:\s–—-]+$/g, "").replace(/^[()|,;:\s–—-]+/g, "").trim();
      const head = rest || pendingTitle || "";
      const [cargo, empresa] = splitHead(head, true);
      job = { cargo: (cargo ?? "").trim(), empresa: (empresa ?? "").trim(), desde: period[1]!.trim(), hasta: period[2]!.trim(), funciones: [], logros: [] };
      if (!rest && pendingTitle) pendingTitle = null;
      jobs.push(job);
      continue;
    }
    if (job && BULLET.test(line)) {
      const item = line.replace(BULLET, "").trim();
      if (/logr|aument|reduj|redu[cz]|mejor[eé]|increment|ahorr|\d+\s?%/i.test(item)) job.logros.push(item);
      else job.funciones.push(item);
      continue;
    }
    if (job && job.funciones.length === 0 && !job.empresa && line.length < 80) {
      job.empresa = line;
      continue;
    }
    pendingTitle = line.length < 100 ? line : null;
  }
  return jobs.slice(0, 20);
}

function parseLanguages(text: string, section: string[]): CvProfile["idiomas"] {
  const found = new Map<string, string>();
  const haystack = [...section, ...text.split("\n").filter((l) => /idioma|ingl[eé]s|franc[eé]s|portugu[eé]s|espa[nñ]ol/i.test(l))];
  for (const line of haystack) {
    for (const lang of LANGS) {
      const fold = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (!new RegExp(`\\b${fold(lang)}\\b`).test(fold(line))) continue;
      const level = LEVELS.find(([r]) => r.test(line))?.[1] ?? "Sin indicar";
      if (!found.has(lang) || found.get(lang) === "Sin indicar") found.set(lang, level);
    }
  }
  return [...found.entries()].map(([idioma, nivel]) => ({ idioma, nivel }));
}

export function parseCvText(text: string): CvProfile {
  const lines = text.replace(/\r/g, "").split("\n");
  const s = splitSections(lines);
  const experiencia = parseExperience(s.experiencia ?? []);
  const formacion = (s.formacion ?? [])
    .filter((l) => l.length > 4)
    .slice(0, 10)
    .map((l) => {
      const periodo = l.match(/(19|20)\d{2}(\s*[-–]\s*((19|20)\d{2}|actual(idad)?|presente))?/i)?.[0] ?? "";
      const body = l.replace(periodo, "").replace(BULLET, "").replace(/[()]/g, "").trim().replace(/[,–-]\s*$/, "");
      const [titulo, institucion] = splitHead(body, false);
      return { titulo: (titulo ?? "").trim(), institucion: (institucion ?? "").trim(), periodo };
    })
    .filter((f) => f.titulo);
  const skillsSection = (s.habilidades ?? []).flatMap((l) => l.replace(BULLET, "").split(/[,;•|]/)).map((x) => x.trim()).filter((x) => x && x.length < 60);
  const lower = text.toLowerCase();
  const detected = SKILL_WORDS.filter((w) => lower.includes(w.toLowerCase()));
  const habilidades = [...new Set([...skillsSection, ...detected])].slice(0, 40);
  const licencias = [...new Set([...(s.licencias ?? []), ...lines.filter((l) => /licencia\s+(de conducir\s+)?(tipo\s+)?[ABCDE]\d?\b/i.test(l))].map((l) => l.replace(BULLET, "").trim()))].slice(0, 8);
  const certificaciones = (s.certificaciones ?? []).map((l) => l.replace(BULLET, "").trim()).filter(Boolean).slice(0, 20);
  const perfil = (s.perfil ?? []).join(" ").slice(0, 1200);
  const first = (s.encabezado ?? []).find((l) => !/[@\d[]/.test(l) && l.length < 80 && l.split(" ").length <= 8 && !l.includes("[CANDIDATO]"));
  const years = totalYears(experiencia);
  return {
    ...EMPTY_PROFILE,
    resumen: perfil,
    puesto_actual: experiencia.find((e) => /actual|presente|fecha|hoy/i.test(e.hasta))?.cargo || experiencia[0]?.cargo || first || "",
    anios_experiencia: years,
    formacion,
    experiencia,
    habilidades,
    idiomas: parseLanguages(text, s.idiomas ?? []),
    certificaciones,
    licencias,
    conocimientos: detected.filter((d) => !skillsSection.some((x) => x.toLowerCase() === d.toLowerCase())).slice(0, 20),
  };
}
