/**
 * Texto de un PDF con capa de texto (los escaneados no la tienen). Se ejecuta
 * en el NAVEGADOR del reclutador: la biblioteca (pdf.js vía unpdf, licencia
 * MIT) se carga solo al leer un PDF y no forma parte del Worker.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { text: (text as string[]).join("\n\n").trim(), pages: totalPages };
}
