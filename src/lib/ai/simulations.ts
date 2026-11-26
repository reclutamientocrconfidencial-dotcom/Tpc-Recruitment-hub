import type { CvProfile } from "@/lib/cv/profile";
import type { InterviewConclusions, MatchStatus, Preselection, SimInput } from "@/lib/ai/features";

/**
 * Resultados SIMULADOS deterministas (desarrollo, pruebas y TEST): reglas
 * transparentes sobre los mismos datos seudonimizados que recibiría un
 * proveedor externo. Nunca inventan: lo que no encuentran queda como
 * «información insuficiente».
 */
const STOP = new Set(["para", "con", "como", "del", "las", "los", "una", "uno", "por", "sus", "que", "año", "años", "nivel", "minimo", "mínimo", "experiencia", "conocimiento", "conocimientos", "manejo", "deseable", "obligatorio"]);
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tokens = (s: string) => fold(s).split(/[^a-z0-9+#.]+/).filter((t) => t.length >= 3 && !STOP.has(t));
const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Todas las líneas del perfil, con su origen, para citar evidencia. */
export function profileLines(p: CvProfile | null | undefined): string[] {
  if (!p) return [];
  return [
    p.puesto_actual && `Puesto actual: ${p.puesto_actual}`,
    ...p.experiencia.flatMap((e) => [
      `${e.cargo}${e.empresa ? ` en ${e.empresa}` : ""} (${e.desde || "?"} – ${e.hasta || "?"})`,
      ...e.funciones.map((f) => `Función (${e.cargo}): ${f}`),
      ...e.logros.map((l) => `Logro (${e.cargo}): ${l}`),
    ]),
    ...p.formacion.map((f) => `Formación: ${f.titulo}${f.institucion ? `, ${f.institucion}` : ""}${f.periodo ? ` (${f.periodo})` : ""}`),
    ...p.habilidades.map((h) => `Habilidad: ${h}`),
    ...p.idiomas.map((i) => `Idioma: ${i.idioma} ${i.nivel}`),
    ...p.certificaciones.map((c) => `Certificación: ${c}`),
    ...p.licencias.map((l) => `Licencia: ${l}`),
    ...p.conocimientos.map((c) => `Conocimiento: ${c}`),
  ].filter((x): x is string => Boolean(x));
}

function matchRequirement(name: string, p: CvProfile | null | undefined): { estado: MatchStatus; evidencia: string; pendiente: string } {
  const lines = profileLines(p);
  if (!p || !lines.length) return { estado: "insuficiente", evidencia: "", pendiente: "No hay perfil curricular confirmado para analizar." };
  // Idiomas con nivel MCER
  const lvl = name.toUpperCase().match(/\b(A1|A2|B1|B2|C1|C2)\b/)?.[1];
  const lang = /ingl[eé]s|english/i.test(name) ? "ingles" : /portugu/i.test(name) ? "portugues" : /franc/i.test(name) ? "frances" : null;
  if (lang) {
    const found = p.idiomas.find((i) => fold(i.idioma).startsWith(lang));
    if (!found) return { estado: "insuficiente", evidencia: "", pendiente: `El CV no menciona el idioma. Verificar ${name}.` };
    const have = CEFR.indexOf(found.nivel.toUpperCase());
    if (lvl && have >= 0 && have >= CEFR.indexOf(lvl)) return { estado: "confirmado", evidencia: `Idioma: ${found.idioma} ${found.nivel} (declarado en el CV)`, pendiente: "Confirmar con prueba de idioma." };
    return { estado: "parcial", evidencia: `Idioma: ${found.idioma} ${found.nivel}`, pendiente: `Nivel declarado inferior o sin indicar; verificar ${lvl ?? "el nivel"} con prueba.` };
  }
  // Años de experiencia
  const years = fold(name).match(/(\d{1,2})\s*(?:\+\s*)?anos?/)?.[1];
  if (years) {
    const need = Number(years);
    if (p.anios_experiencia >= need) return { estado: "confirmado", evidencia: `${p.anios_experiencia} años de experiencia total según los períodos del CV`, pendiente: "Validar que la experiencia corresponda al área requerida." };
    if (p.anios_experiencia > 0) return { estado: "parcial", evidencia: `${p.anios_experiencia} años de experiencia total según el CV`, pendiente: `Requiere ${need} años: confirmar experiencia adicional no detallada.` };
  }
  const words = tokens(name);
  if (!words.length) return { estado: "insuficiente", evidencia: "", pendiente: `Verificar «${name}» en la entrevista.` };
  let best = { line: "", hits: 0 };
  for (const line of lines) {
    const f = fold(line);
    const hits = words.filter((w) => f.includes(w)).length;
    if (hits > best.hits) best = { line, hits };
  }
  if (best.hits === words.length) return { estado: "confirmado", evidencia: best.line, pendiente: "Profundizar con ejemplos concretos en la entrevista." };
  if (best.hits > 0) return { estado: "parcial", evidencia: best.line, pendiente: `Evidencia incompleta: verificar «${name}».` };
  return { estado: "insuficiente", evidencia: "", pendiente: `El CV no aporta información sobre «${name}».` };
}

export function simulatePreselection(input: SimInput): Preselection {
  const reqs = input.requirements ?? [];
  const matriz = reqs.map((r) => {
    if (r.status === "cumple") return { requisito: r.name, tipo: r.type, estado: "confirmado" as const, evidencia: "Verificado por el reclutador.", pendiente: "" };
    if (r.status === "no_cumple") return { requisito: r.name, tipo: r.type, estado: "incumplido" as const, evidencia: "Documentado por el reclutador.", pendiente: "" };
    return { requisito: r.name, tipo: r.type, ...matchRequirement(r.name, input.profile) };
  });
  const count = (s: MatchStatus) => matriz.filter((m) => m.estado === s).length;
  const p = input.profile;
  const fortalezas = [
    ...matriz.filter((m) => m.estado === "confirmado").map((m) => `${m.requisito}: ${m.evidencia}`),
    ...(p?.experiencia.flatMap((e) => e.logros).slice(0, 2).map((l) => `Logro documentado: ${l}`) ?? []),
  ].slice(0, 6);
  const brechas = matriz.filter((m) => m.estado === "incumplido" || (m.estado === "insuficiente" && m.tipo === "obligatorio")).map((m) => `${m.requisito} (${m.estado === "incumplido" ? "incumplimiento documentado" : "sin información"})`);
  const explorar = matriz.filter((m) => m.estado === "parcial" || m.estado === "insuficiente").map((m) => m.pendiente).slice(0, 8);
  return {
    resumen: `De ${matriz.length} requisitos: ${count("confirmado")} con cumplimiento confirmado, ${count("parcial")} parciales, ${count("incumplido")} con incumplimiento documentado y ${count("insuficiente")} sin información suficiente.${p?.anios_experiencia ? ` Experiencia total declarada: ${String(p.anios_experiencia).replace(".", ",")} años.` : ""} (Análisis simulado; la decisión es del reclutador.)`,
    matriz,
    fortalezas,
    brechas,
    explorar_en_entrevista: explorar,
  };
}

export function simulateInterviewQuestions(input: SimInput): { preguntas: Array<{ texto: string; competencia: string; objetivo: string; fundamento: string }> } {
  const p = input.profile;
  const out: Array<{ texto: string; competencia: string; objetivo: string; fundamento: string }> = [];
  const last = p?.experiencia[0];
  if (last) {
    out.push({
      texto: `En su puesto de ${last.cargo}${last.empresa ? ` en ${last.empresa}` : ""}, ¿cuáles eran sus principales responsabilidades y cómo medían su desempeño?`,
      competencia: "Experiencia específica",
      objetivo: "Confirmar el alcance real del puesto y sus indicadores.",
      fundamento: `CV: ${last.cargo} (${last.desde} – ${last.hasta}).`,
    });
    for (const l of last.logros.slice(0, 1)) {
      out.push({ texto: `Usted menciona: «${l}». ¿Cómo lo logró, qué hizo usted personalmente y cómo se midió el resultado?`, competencia: "Orientación a resultados", objetivo: "Validar la autoría y la medición del logro.", fundamento: "Logro declarado en el CV." });
    }
  }
  for (const r of (input.requirements ?? []).filter((r) => r.status !== "cumple" && r.status !== "no_aplica").slice(0, 4)) {
    out.push({ texto: `Describa una situación reciente en la que aplicó ${r.name}: contexto, acciones y resultado.`, competencia: r.type === "obligatorio" ? "Requisito obligatorio" : "Requisito deseable", objetivo: `Obtener evidencia concreta de «${r.name}».`, fundamento: "Requisito de la vacante pendiente de verificar." });
  }
  for (const pend of (input.pending ?? []).slice(0, 2)) {
    out.push({ texto: `Para completar su perfil: ${pend.replace(/\.$/, "")}. ¿Podría darnos un ejemplo?`, competencia: "Verificación", objetivo: "Resolver un aspecto pendiente de la preselección.", fundamento: pend });
  }
  if (input.vacancyDescription) {
    out.push({ texto: `El puesto de ${input.vacancyTitle ?? "la vacante"} incluye: ${input.vacancyDescription.slice(0, 160)}. ¿Qué experiencia tiene con funciones similares?`, competencia: "Ajuste a las funciones", objetivo: "Relacionar su experiencia con las funciones del puesto.", fundamento: "Funciones descritas en la vacante." });
  }
  out.push({ texto: "Cuénteme de un problema laboral difícil que resolvió: ¿qué alternativas consideró y por qué eligió la que aplicó?", competencia: "Resolución de problemas", objetivo: "Observar análisis y toma de decisiones.", fundamento: "Competencia transversal del puesto." });
  return { preguntas: out.slice(0, 10) };
}

export function simulateInterviewConclusions(input: SimInput): InterviewConclusions {
  const answered = (input.answers ?? []).filter((a) => a.notes?.trim());
  const evidencias = answered.filter((a) => /\d|%|logr|implement|lider|reduj|aument/i.test(a.notes!)).map((a) => `${a.competency ? `${a.competency}: ` : ""}${a.notes!.trim()}`).slice(0, 8);
  const fortalezas = answered.filter((a) => (a.rating ?? 0) >= 4).map((a) => `${a.competency || a.question}: valoración ${a.rating}/5`).slice(0, 6);
  const validar = [
    ...answered.filter((a) => (a.rating ?? 5) <= 2).map((a) => `${a.competency || a.question}: respuesta con poca evidencia`),
    ...(input.answers ?? []).filter((a) => !a.notes?.trim()).map((a) => `Sin respuesta registrada: ${a.question}`),
  ].slice(0, 8);
  return {
    resumen: answered.length ? `Se registraron ${answered.length} de ${(input.answers ?? []).length} respuestas. (Borrador simulado; revise y complete.)` : "No hay respuestas registradas para resumir.",
    evidencias,
    fortalezas,
    aspectos_por_validar: validar,
    conclusion: answered.length ? "Con base en las notas registradas, el reclutador debe valorar las evidencias y los aspectos por validar antes de emitir su recomendación." : "Sin información suficiente para concluir.",
  };
}
