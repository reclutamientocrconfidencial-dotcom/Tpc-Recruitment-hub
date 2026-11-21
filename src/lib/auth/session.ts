import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_PROFILE } from "@/lib/demo/data";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/auth/demo";
import type { Profile } from "@/types/database";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Profile["role"] | null;
  isActive: boolean;
}

/** Usuario autenticado actual (o null). Se memoriza por solicitud. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (isDemoMode()) {
    const store = await cookies();
    if (store.get(DEMO_SESSION_COOKIE)?.value !== DEMO_SESSION_VALUE) return null;
    return {
      id: DEMO_PROFILE.id,
      email: DEMO_PROFILE.email,
      fullName: DEMO_PROFILE.full_name,
      role: DEMO_PROFILE.role,
      isActive: true,
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "full_name" | "role" | "is_active">>();

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name || user.email || "Usuario",
    role: profile?.is_active ? profile.role : null,
    isActive: profile?.is_active ?? false,
  };
});

/** Exige sesión; redirige al inicio de sesión si no existe. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
