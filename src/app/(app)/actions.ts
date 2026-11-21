"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_SESSION_COOKIE } from "@/lib/auth/demo";

export async function signOutAction() {
  if (isDemoMode()) {
    (await cookies()).delete(DEMO_SESSION_COOKIE);
  } else if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
