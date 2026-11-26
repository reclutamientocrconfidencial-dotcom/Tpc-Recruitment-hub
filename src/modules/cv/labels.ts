import type { LabelDef } from "@/modules/labels";
import type { CvProfileStatus, CvQuality } from "@/modules/cv/repository";

export const CV_STATUS: Record<CvProfileStatus, LabelDef> = {
  borrador: { label: "Borrador por revisar", tone: "warning" },
  confirmado: { label: "Confirmado", tone: "success" },
  reemplazado: { label: "Reemplazado", tone: "muted" },
  descartado: { label: "Descartado", tone: "muted" },
};

export const CV_QUALITY: Record<CvQuality, LabelDef> = {
  legible: { label: "Lectura completa", tone: "success" },
  parcial: { label: "Lectura parcial: revisar", tone: "warning" },
  ilegible: { label: "No legible: completar a mano", tone: "red" },
};

export const CV_SOURCE = { ia: "Asistente de IA", simulado: "Lectura automática (sin proveedor externo)", manual: "Manual" } as const;
