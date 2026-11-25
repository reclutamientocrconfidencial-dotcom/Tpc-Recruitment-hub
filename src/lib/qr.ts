import { create } from "qrcode/lib/core/qrcode";

/**
 * Genera un código QR en SVG (texto) para un enlace público. Se dibuja en el
 * servidor, sin servicios externos, para que el enlace no salga de la empresa.
 */
export function qrSvg(text: string, { margin = 4, title = "Código QR" }: { margin?: number; title?: string } = {}): string {
  const { modules } = create(text, { errorCorrectionLevel: "M" });
  const size = modules.size;
  const full = size + margin * 2;
  let path = "";
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (modules.data[row * size + col]) path += `M${col + margin} ${row + margin}h1v1h-1z`;
    }
  }
  const safeTitle = title.replace(/[<>&"]/g, "");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges" role="img" aria-label="${safeTitle}">` +
    `<title>${safeTitle}</title><rect width="100%" height="100%" fill="#ffffff"/><path fill="#000000" d="${path}"/></svg>`
  );
}
