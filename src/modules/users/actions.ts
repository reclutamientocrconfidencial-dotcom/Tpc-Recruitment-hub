"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizeAction } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db-errors";
import { DEMO_READ_ONLY, type ActionState } from "@/lib/action-state";
import { APP_ROLES } from "@/types/database";

const schema = z.object({
  id: z.uuid(),
  full_name: z.string().trim().min(2, "Nombre: mínimo 2 caracteres.").max(150, "Nombre: máximo 150 caracteres."),
  role: z.enum(APP_ROLES, { error: "Rol inválido." }),
  is_active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

/**
 * Cambia nombre, rol y estado de un usuario (solo admin). La base de datos
 * vuelve a verificar que sea admin y que no se degrade/desactive a sí mismo.
 * La creación de cuentas se realiza en el panel de Supabase.
 */
export async function updateUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("usuarios:gestionar");
  if (auth.error !== null) return { error: auth.error };
  const parsed = schema.safeParse({
    id: formData.get("id"),
    full_name: formData.get("full_name"),
    role: formData.get("role"),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true" ? "true" : "false",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  if (parsed.data.id === auth.user.id && (parsed.data.role !== "admin" || !parsed.data.is_active)) {
    return { error: "No puede quitarse a sí mismo el rol de administrador ni desactivar su propia cuenta." };
  }
  if (isDemoMode()) return { error: DEMO_READ_ONLY };

  const { id, ...changes } = parsed.data;
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("profiles").update(changes).eq("id", id).select("id");
  if (error) {
    console.warn("[users.update]", error.code);
    return { error: dbErrorMessage(error) };
  }
  if (!data || data.length === 0) return { error: "No tiene permiso para modificar este usuario." };
  revalidatePath("/administracion/usuarios");
  return { ok: true, message: "Usuario actualizado." };
}
