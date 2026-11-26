import type { CvProfile } from "@/lib/cv/profile";
import { cleanText, toItems, visibleSections, type ReportModel, type ReportSectionV2, type TernaModel, type Tone } from "@/lib/report/model";

/** Datos ya autorizados y validados para componer el informe (sin consultas). */
export interface ReportInput {
  header: string;
  footer: string;
  templateVersion: string;
  title: string;
  reportVersion: number;
  finalizedAt: string;
  finalizedBy: string | null;
  candidate: { name: string; currentTitle: string | null; years: number | null; english: string | null };
  vacancy: { code: string; title: string; position: string | null; client: string; location: string | null; modality: string | null; schedule: string | null };
  recruiter: string | null;
  recommendation: "recomendado" | "con_reservas" | "no_recomendado" | null;
  /** Textos redactados por el reclutador (clave de la plantilla → texto). */
  content: Record<string, string>;
  templateSections: Array<{ key: string; title: string }>;
  /** Perfil curricular CONFIRMADO (null si no hay). */
  cv: CvProfile | null;
  requirements: Array<{ name: string; type: string; status: "pendiente" | "cumple" | "no_cumple"; level: string | null; note: string | null }>;
  assessments: Array<{
    name: string;
    kind: string;
    requirement: "obligatoria" | "deseable";
    status: "pendiente" | "aprobada" | "reprobada" | "no_presento";
    normalized: number | null;
    detail: string;
    criteria: Array<{ name: string; score: number; weight: number }>;
    notes: string | null;
  }>;
  weightedScore: number | null;
  interviews: Array<{ date: string; kind: string; interviewer: string; rating: number | null; recommendation: string | null; answers: Array<{ competency: string | null; rating: number | null }> }>;
}

export const RECOMMENDATION_VIEW: Record<NonNullable<ReportInput["recommendation"]>, { label: string; tone: Tone }> = {
  recomendado: { label: "Recomendado", tone: "dark" },
  con_reservas: { label: "Recomendado con reservas", tone: "grey" },
  no_recomendado: { label: "No recomendado", tone: "red" },
};
const REQ_STATUS: Record<string, { label: string; tone: Tone }> = {
  cumple: { label: "Cumple", tone: "dark" },
  no_cumple: { label: "No cumple", tone: "red" },
  pendiente: { label: "Por validar", tone: "light" },
};
const ASSESS_STATUS: Record<string, string> = { pendiente: "Pendiente", aprobada: "Aprobada", reprobada: "Reprobada", no_presento: "No se presentó" };

/**
 * Apartados de texto fijos y cómo reconocerlos en cualquier versión de la
 * plantilla (las claves se derivan del título que publica administración).
 */
const SLOTS: Record<string, RegExp> = {
  resumen_ejecutivo: /^resumen(_ejecutivo)?$|resumen_ejecutivo|^sintesis/,
  evidencias_entrevista: /evidencia/,
  casos_practicos: /caso/,
  fortalezas: /^fortaleza/,
  aspectos_por_validar: /validar|pendiente/,
  disponibilidad: /^disponibilidad/,
  conclusion: /conclusion|recomendacion_del_reclutador/,
};

/** Textos por apartado fijo + claves que no encajan en ninguno (se muestran como apartados adicionales). */
export function resolveContent(content: Record<string, string>, keys: string[]): { slots: Record<string, string>; used: Set<string> } {
  const slots: Record<string, string> = {};
  const used = new Set<string>();
  for (const [slot, re] of Object.entries(SLOTS)) {
    const key = keys.includes(slot) ? slot : keys.find((k) => !used.has(k) && re.test(k));
    if (key) {
      slots[slot] = content[key] ?? "";
      used.add(key);
    }
  }
  return { slots, used };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace(".", ",");

export function composeReport(i: ReportInput): ReportModel {
  const keys = i.templateSections.length ? i.templateSections.map((t) => t.key) : Object.keys(i.content);
  const { slots: c, used } = resolveContent(i.content, keys);
  const rec = i.recommendation ? RECOMMENDATION_VIEW[i.recommendation] : { label: "Sin recomendación", tone: "light" as Tone };
  const mandatory = i.requirements.filter((r) => r.type === "obligatorio");
  const tests = i.assessments.filter((a) => a.kind !== "caso_practico" && a.kind !== "entrevista");
  const cases = i.assessments.filter((a) => a.kind === "caso_practico");
  const interviewAssess = i.assessments.filter((a) => a.kind === "entrevista");

  // Competencias: promedio de las calificaciones (1–5) por competencia en entrevistas realizadas + criterios de entrevistas por competencias.
  const comp = new Map<string, number[]>();
  for (const iv of i.interviews) for (const a of iv.answers) if (a.competency && a.rating) (comp.get(a.competency) ?? comp.set(a.competency, []).get(a.competency)!).push(a.rating);
  for (const a of interviewAssess) for (const k of a.criteria) (comp.get(k.name) ?? comp.set(k.name, []).get(k.name)!).push(k.score);
  const competencies = [...comp.entries()]
    .map(([label, xs]) => {
      const avg = xs.reduce((s, x) => s + x, 0) / xs.length;
      return { label, value: Math.round((avg / 5) * 100), display: `${fmt(Math.round(avg * 10) / 10)} / 5`, note: `${xs.length} observación(es)` };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  const general: Array<[string, string]> = [
    ["Candidato(a)", i.candidate.name],
    ["Puesto actual", i.cv?.puesto_actual || i.candidate.currentTitle || ""],
    ["Experiencia total", i.cv?.anios_experiencia ? `${fmt(i.cv.anios_experiencia)} años` : i.candidate.years != null ? `${fmt(i.candidate.years)} años` : ""],
    ["Vacante", `${i.vacancy.title} (${i.vacancy.code})`],
    ["Puesto", i.vacancy.position ?? ""],
    ["Cliente", i.vacancy.client],
    ["Ubicación y modalidad", [i.vacancy.location, i.vacancy.modality].filter(Boolean).join(" · ")],
    ["Jornada", i.vacancy.schedule ?? ""],
    ["Idiomas", i.cv?.idiomas.length ? i.cv.idiomas.map((x) => `${x.idioma} ${x.nivel}`).join(" · ") : i.candidate.english ? `Inglés ${i.candidate.english}` : ""],
    ["Reclutador(a)", i.recruiter ?? i.finalizedBy ?? ""],
  ];

  const met = mandatory.filter((r) => r.status === "cumple").length;
  const doneTests = i.assessments.filter((a) => a.status !== "pendiente").length;
  const kpis = [
    i.weightedScore != null ? { label: "Resultado ponderado", value: `${fmt(i.weightedScore)}`, sub: "de 100 · evaluaciones aplicables" } : null,
    mandatory.length ? { label: "Requisitos obligatorios", value: `${met}/${mandatory.length}`, sub: "verificados como cumplidos" } : null,
    i.assessments.length ? { label: "Evaluaciones", value: `${doneTests}/${i.assessments.length}`, sub: "con resultado registrado" } : null,
    i.interviews.length ? { label: "Entrevistas", value: String(i.interviews.length), sub: "realizadas" } : null,
  ].filter((x): x is { label: string; value: string; sub: string } => Boolean(x));

  const extra: ReportSectionV2[] = i.templateSections
    .filter((s) => !used.has(s.key) && cleanText(i.content[s.key]))
    .map((s) => ({ title: s.title, blocks: [{ kind: "text", body: i.content[s.key]! }] }));

  const sections: ReportSectionV2[] = [
    { title: "Información general", blocks: [{ kind: "facts", rows: general }] },
    { title: "Resumen ejecutivo", blocks: [{ kind: "kpis", items: kpis }, { kind: "text", body: c.resumen_ejecutivo ?? "" }] },
    {
      title: "Formación académica",
      blocks: [
        { kind: "timeline", items: (i.cv?.formacion ?? []).map((f) => ({ title: f.titulo, subtitle: f.institucion, period: f.periodo, bullets: [] })) },
        { kind: "list", items: [...(i.cv?.certificaciones ?? []).map((x) => `Certificación: ${x}`), ...(i.cv?.licencias ?? []).map((x) => `Licencia: ${x}`)] },
      ],
    },
    {
      title: "Trayectoria laboral relevante",
      blocks: [
        {
          kind: "timeline",
          items: (i.cv?.experiencia ?? []).slice(0, 6).map((e) => ({
            title: e.cargo,
            subtitle: e.empresa,
            period: [e.desde, e.hasta].filter(Boolean).join(" – "),
            bullets: [...e.funciones.slice(0, 4), ...e.logros.slice(0, 3).map((l) => `Logro: ${l}`)],
          })),
        },
      ],
    },
    {
      title: "Matriz de cumplimiento",
      blocks: [
        {
          kind: "matrix",
          rows: i.requirements.map((r) => ({
            requirement: r.name,
            type: r.type === "obligatorio" ? "Obligatorio" : "Deseable",
            status: REQ_STATUS[r.status]?.label ?? r.status,
            tone: REQ_STATUS[r.status]?.tone ?? "light",
            evidence: [r.level ? `Nivel ${r.level}` : "", r.note ?? ""].filter(Boolean).join(" · "),
          })),
        },
      ],
    },
    {
      title: "Evidencias de la entrevista",
      blocks: [
        { kind: "list", items: toItems(c.evidencias_entrevista) },
        {
          kind: "table",
          headers: ["Fecha", "Modalidad", "Entrevistador(a)", "Valoración"],
          rows: i.interviews.map((v) => [v.date, v.kind, v.interviewer, [v.rating ? `${v.rating}/5` : "", v.recommendation ?? ""].filter(Boolean).join(" · ") || "—"]),
          widths: [20, 20, 30, 30],
        },
      ],
    },
    { title: "Evaluación de competencias", blocks: [{ kind: "bars", rows: competencies, caption: "Promedio de las calificaciones registradas en entrevista (escala 1 a 5)." }] },
    {
      title: "Resultados de pruebas",
      blocks: [
        {
          kind: "bars",
          rows: tests.map((a) => ({ label: a.name, value: a.normalized, display: a.normalized != null ? `${fmt(a.normalized)} / 100` : ASSESS_STATUS[a.status] ?? a.status, note: [a.requirement === "obligatoria" ? "Obligatoria" : "Opcional", ASSESS_STATUS[a.status], a.detail].filter(Boolean).join(" · ") })),
          caption: i.weightedScore != null ? `Resultado ponderado de las evaluaciones aplicables: ${fmt(i.weightedScore)} de 100. Las evaluaciones no aplicables no afectan el resultado.` : undefined,
        },
      ],
    },
    {
      title: "Casos prácticos",
      blocks: [
        ...cases.map((a) => ({
          kind: "bars" as const,
          rows: a.criteria.length
            ? a.criteria.map((k) => ({ label: k.name, value: Math.round((k.score / 5) * 100), display: `${k.score} / 5` }))
            : [{ label: a.name, value: a.normalized, display: a.normalized != null ? `${fmt(a.normalized)} / 100` : ASSESS_STATUS[a.status] ?? "" }],
          caption: `${a.name}: ${ASSESS_STATUS[a.status]}${a.normalized != null ? ` · ${fmt(a.normalized)} de 100` : ""}${a.notes ? ` · ${a.notes}` : ""}`,
        })),
        { kind: "text", body: c.casos_practicos ?? "" },
      ],
    },
    { title: "Fortalezas", blocks: [{ kind: "list", items: toItems(c.fortalezas) }] },
    { title: "Aspectos por validar", blocks: [{ kind: "list", items: toItems(c.aspectos_por_validar) }] },
    { title: "Disponibilidad y condiciones laborales", blocks: [{ kind: "text", body: c.disponibilidad ?? "" }] },
    ...extra,
    { title: "Conclusión y recomendación", blocks: [{ kind: "recommendation", label: rec.label, tone: rec.tone, body: c.conclusion ?? "" }] },
  ];

  return {
    header: i.header,
    footer: i.footer,
    templateVersion: i.templateVersion,
    title: i.title,
    candidateName: i.candidate.name,
    subtitle: [i.vacancy.position ?? i.vacancy.title, i.vacancy.code].filter(Boolean).join(" · "),
    client: i.vacancy.client,
    reportVersion: i.reportVersion,
    finalizedAt: i.finalizedAt,
    finalizedBy: i.finalizedBy,
    recommendation: rec,
    sections: visibleSections(sections),
  };
}

/** Terna: compara 2 a 6 informes finales de la misma vacante. */
export function composeTerna(base: Omit<TernaModel, "candidates" | "matrix">, items: Array<{ input: ReportInput }>): TernaModel {
  const reqNames = [...new Set(items.flatMap((x) => x.input.requirements.map((r) => r.name)))].slice(0, 20);
  return {
    ...base,
    candidates: items.map(({ input: i }) => {
      const mandatory = i.requirements.filter((r) => r.type === "obligatorio");
      return {
        name: i.candidate.name,
        currentTitle: i.cv?.puesto_actual || i.candidate.currentTitle || "—",
        years: i.cv?.anios_experiencia ? `${fmt(i.cv.anios_experiencia)} años` : i.candidate.years != null ? `${fmt(i.candidate.years)} años` : "—",
        recommendation: i.recommendation ? RECOMMENDATION_VIEW[i.recommendation] : { label: "Sin recomendación", tone: "light" },
        weighted: i.weightedScore,
        mandatory: mandatory.length ? `${mandatory.filter((r) => r.status === "cumple").length}/${mandatory.length}` : "—",
        strengths: toItems(resolveContent(i.content, i.templateSections.length ? i.templateSections.map((t) => t.key) : Object.keys(i.content)).slots.fortalezas).slice(0, 3),
        toValidate: toItems(resolveContent(i.content, i.templateSections.length ? i.templateSections.map((t) => t.key) : Object.keys(i.content)).slots.aspectos_por_validar).slice(0, 3),
      };
    }),
    matrix: reqNames.map((name) => {
      const first = items.flatMap((x) => x.input.requirements).find((r) => r.name === name);
      return {
        requirement: name,
        type: first?.type === "obligatorio" ? "Obligatorio" : "Deseable",
        cells: items.map(({ input }) => {
          const r = input.requirements.find((x) => x.name === name);
          const v = r ? REQ_STATUS[r.status] : undefined;
          return v ? { status: v.label, tone: v.tone } : { status: "—", tone: "light" as Tone };
        }),
      };
    }),
  };
}
