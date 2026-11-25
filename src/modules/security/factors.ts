import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type Sb = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface TotpFactor {
  id: string;
  friendly_name?: string | null;
  created_at: string;
}

/**
 * Factores TOTP verificados del usuario. Se consultan a Supabase Auth y, si no
 * responde con factores (observado en Cloudflare Workers), se usan los de la
 * sesión. Supabase vuelve a validar factor y código en cada desafío.
 */
export async function verifiedTotpFactors(sb: Sb): Promise<TotpFactor[]> {
  const { data } = await sb.auth.mfa.listFactors();
  const listed = (data?.totp ?? []).filter((f) => f.status === "verified");
  if (listed.length > 0) return listed;
  const { data: session } = await sb.auth.getSession();
  return (session.session?.user.factors ?? []).filter((f) => f.factor_type === "totp" && f.status === "verified");
}
