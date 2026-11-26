import { z } from "zod";

/** Perfil curricular estructurado (lo que se revisa y confirma antes de incorporarlo a la ficha). */
export const cvProfileSchema = z.object({
  resumen: z.string(),
  puesto_actual: z.string(),
  anios_experiencia: z.number(),
  experiencia_especifica: z.string(),
  formacion: z.array(z.object({ titulo: z.string(), institucion: z.string(), periodo: z.string() })),
  experiencia: z.array(
    z.object({
      cargo: z.string(),
      empresa: z.string(),
      desde: z.string(),
      hasta: z.string(),
      funciones: z.array(z.string()),
      logros: z.array(z.string()),
    }),
  ),
  habilidades: z.array(z.string()),
  idiomas: z.array(z.object({ idioma: z.string(), nivel: z.string() })),
  certificaciones: z.array(z.string()),
  licencias: z.array(z.string()),
  conocimientos: z.array(z.string()),
});

export type CvProfile = z.infer<typeof cvProfileSchema>;

export const EMPTY_PROFILE: CvProfile = {
  resumen: "",
  puesto_actual: "",
  anios_experiencia: 0,
  experiencia_especifica: "",
  formacion: [],
  experiencia: [],
  habilidades: [],
  idiomas: [],
  certificaciones: [],
  licencias: [],
  conocimientos: [],
};

/** Normaliza lo que venga de la BD o de un proveedor: nunca falla, completa campos faltantes y recorta tamaños. */
export function normalizeProfile(raw: unknown): CvProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
  const list = (v: unknown, max = 40) => (Array.isArray(v) ? v.map((x) => str(x, 300)).filter(Boolean).slice(0, max) : []);
  const objs = <T,>(v: unknown, map: (o: Record<string, unknown>) => T, max = 30): T[] =>
    Array.isArray(v) ? v.filter((x) => x && typeof x === "object").slice(0, max).map((x) => map(x as Record<string, unknown>)) : [];
  const years = Number(r.anios_experiencia);
  return {
    resumen: str(r.resumen, 2000),
    puesto_actual: str(r.puesto_actual, 150),
    anios_experiencia: Number.isFinite(years) ? Math.min(Math.max(Math.round(years * 10) / 10, 0), 70) : 0,
    experiencia_especifica: str(r.experiencia_especifica, 1000),
    formacion: objs(r.formacion, (o) => ({ titulo: str(o.titulo, 200), institucion: str(o.institucion, 200), periodo: str(o.periodo, 60) })).filter((f) => f.titulo || f.institucion),
    experiencia: objs(r.experiencia, (o) => ({
      cargo: str(o.cargo, 150),
      empresa: str(o.empresa, 150),
      desde: str(o.desde, 30),
      hasta: str(o.hasta, 30),
      funciones: list(o.funciones, 20),
      logros: list(o.logros, 15),
    })).filter((e) => e.cargo || e.empresa),
    habilidades: list(r.habilidades),
    idiomas: objs(r.idiomas, (o) => ({ idioma: str(o.idioma, 40), nivel: str(o.nivel, 40) }), 10).filter((i) => i.idioma),
    certificaciones: list(r.certificaciones, 30),
    licencias: list(r.licencias, 10),
    conocimientos: list(r.conocimientos),
  };
}

/** ¿El perfil tiene contenido útil? (para ocultar secciones vacías). */
export function profileIsEmpty(p: CvProfile): boolean {
  return !p.resumen && !p.puesto_actual && !p.formacion.length && !p.experiencia.length && !p.habilidades.length && !p.idiomas.length;
}
