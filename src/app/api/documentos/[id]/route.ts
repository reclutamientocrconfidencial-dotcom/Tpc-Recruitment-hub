import { crossSiteDenied } from "@/lib/http/same-site";
import { signedCvRedirect } from "@/modules/intake/download";

export const dynamic = "force-dynamic";

/** Descarga registrada de un documento de la ficha del candidato. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = crossSiteDenied(req);
  if (denied) return denied;
  const { id } = await params;
  return signedCvRedirect(id, "document_for_download", "p_document_id", "curriculum");
}
