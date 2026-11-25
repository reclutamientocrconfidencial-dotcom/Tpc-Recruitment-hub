/** Contenido de un informe ejecutivo listo para exportar (sin consultas: datos ya autorizados). */
export interface ReportModel {
  header: string;
  footer: string;
  templateVersion: string;
  title: string;
  candidateName: string;
  vacancy: string;
  client: string;
  position: string | null;
  reportVersion: number;
  finalizedAt: string;
  finalizedBy: string | null;
  recommendation: string;
  assessments: Array<{ name: string; requirement: string; result: string; detail: string }>;
  interviews: Array<{ date: string; kind: string; interviewer: string; recommendation: string }>;
  sections: Array<{ title: string; body: string }>;
}

/** Nombre de archivo seguro: «Informe-ejecutivo-Nombre-Apellido-v2.pdf». */
export function reportFileName(candidateName: string, version: number, ext: "docx" | "pdf"): string {
  const base = candidateName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `Informe-ejecutivo-${base || "candidato"}-v${version}.${ext}`;
}

/** Texto plano limpio: sin caracteres de control (excepto saltos de línea) y con longitud acotada. */
export function cleanText(value: string | null | undefined, max = 20_000): string {
  return (value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max).trim();
}
