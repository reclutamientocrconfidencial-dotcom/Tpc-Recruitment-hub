"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { loginSchema, safeRedirectPath } from "@/lib/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_CREDENTIALS } from "@/lib/demo/data";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE } from "@/lib/auth/demo";

export interface LoginState {
  error: string | null;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
  email?: string;
}

// Mensaje genérico: no revela si el correo existe (evita enumeración de usuarios).
const INVALID_CREDENTIALS = "Correo o contraseña incorrectos.";

export async function signInAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const email = String(formData.get("email") ?? "");

  if (!parsed.success) {
    const fieldErrors: LoginState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if ((key === "email" || key === "password") && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: null, fieldErrors, email };
  }

  const next = safeRedirectPath(formData.get("next"));

  if (isDemoMode()) {
    if (parsed.data.email !== DEMO_CREDENTIALS.email || parsed.data.password !== DEMO_CREDENTIALS.password) {
      return { error: INVALID_CREDENTIALS, email };
    }
    const store = await cookies();
    store.set(DEMO_SESSION_COOKIE, DEMO_SESSION_VALUE, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && process.env.E2E !== "true",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    redirect(next);
  }

  if (!isSupabaseConfigured()) {
    return { error: "El sistema aún no está configurado. Contacte al administrador.", email };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    console.warn("[auth] inicio de sesión fallido:", error.status ?? "", error.code ?? "");
    return { error: INVALID_CREDENTIALS, email };
  }
  redirect(next);
}
