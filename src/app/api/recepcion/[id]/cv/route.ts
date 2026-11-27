import { crossSiteDenied } from "@/lib/http/same-site";
import { signedCvRedirect } from "@/modules/intake/download";

export const dynamic = "force-dynamic";

/** Descarga registrada del currículum de un envío en revisión. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = crossSiteDenied(req);
  if (denied) return denied;
  const { id } = await params;
  return signedCvRedirect(id, "submission_cv_for_download", "p_submission_id", "curriculum-envio");
}
