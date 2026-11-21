import { createClient } from "@supabase/supabase-js";
import { USERS, PASSWORD, env } from "./fixtures";

const REQ_1 = "22222222-0000-4000-8000-000000000001";
const VAC_1 = "33333333-0000-4000-8000-000000000001";

/** Prepara usuarios ficticios y asignaciones en el Supabase LOCAL. */
export default async function globalSetup() {
  const url = env("SUPABASE_URL");
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error("Por seguridad, estas pruebas solo se ejecutan contra un Supabase LOCAL.");
  }
  const admin = createClient(url, env("SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of Object.values(USERS)) {
    const existing = list?.users.find((x) => x.email === u.email);
    if (existing) await admin.auth.admin.deleteUser(existing.id);
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.name },
    });
    if (error || !data.user) throw new Error(`No se pudo crear ${u.email}: ${error?.message}`);
    const { error: pErr } = await admin.from("profiles").update({ role: u.role, is_active: u.active }).eq("id", data.user.id);
    if (pErr) throw new Error(`No se pudo asignar el rol: ${pErr.message}`);
    if (u.email === USERS.reclutador.email) {
      await admin.from("requisitions").update({ assigned_recruiter_id: data.user.id }).eq("id", REQ_1);
      await admin.from("vacancies").update({ recruiter_id: data.user.id }).eq("id", VAC_1);
      await admin.from("applications").update({ recruiter_id: data.user.id }).eq("vacancy_id", VAC_1);
    }
  }
}
