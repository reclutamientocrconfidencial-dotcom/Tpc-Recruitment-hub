/** Usuarios 100 % ficticios para pruebas contra Supabase local. */
export const PASSWORD = "Ficticia-2026!";

export const USERS = {
  admin: { email: "admin.e2e@tpc-demo.test", name: "Admin Ficticia", role: "admin", active: true },
  reclutador: { email: "reclutador.e2e@tpc-demo.test", name: "Reclutador Ficticio", role: "reclutador", active: true },
  consulta: { email: "consulta.e2e@tpc-demo.test", name: "Consulta Ficticia", role: "consulta", active: true },
  inactivo: { email: "inactivo.e2e@tpc-demo.test", name: "Inactivo Ficticio", role: "reclutador", active: false },
  coordinador: { email: "coordinador.e2e@tpc-demo.test", name: "Coordinadora Ficticia", role: "coordinador", active: true },
  rotacion: { email: "rotacion.e2e@tpc-demo.test", name: "Usuario Rotación Ficticio", role: "consulta", active: true },
} as const;

export type UserKey = keyof typeof USERS;

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable ${name} (vea playwright.supabase.config.ts)`);
  return value;
}
