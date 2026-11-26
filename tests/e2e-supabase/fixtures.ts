/** Usuarios 100 % ficticios para pruebas contra Supabase local. */
export const PASSWORD = "Ficticia-2026!";

export const USERS = {
  admin: { email: "admin.e2e@tpc-demo.test", name: "Admin Ficticia", role: "admin", active: true },
  reclutador: { email: "reclutador.e2e@tpc-demo.test", name: "Reclutador Ficticio", role: "reclutador", active: true },
  consulta: { email: "consulta.e2e@tpc-demo.test", name: "Consulta Ficticia", role: "consulta", active: true },
  inactivo: { email: "inactivo.e2e@tpc-demo.test", name: "Inactivo Ficticio", role: "reclutador", active: false },
  coordinador: { email: "coordinador.e2e@tpc-demo.test", name: "Coordinadora Ficticia", role: "coordinador", active: true },
  rotacion: { email: "rotacion.e2e@tpc-demo.test", name: "Usuario Rotación Ficticio", role: "consulta", active: true },
  // Puerta S1: usuarios exclusivos de las pruebas de verificación en dos pasos
  mfa: { email: "mfa.e2e@tpc-demo.test", name: "Coordinación MFA Ficticia", role: "coordinador", active: true },
  adminmfa: { email: "adminmfa.e2e@tpc-demo.test", name: "Admin MFA Ficticio", role: "admin", active: true },
} as const;

export type UserKey = keyof typeof USERS;

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable ${name} (vea playwright.supabase.config.ts)`);
  return value;
}

/** Código TOTP (RFC 6238, SHA-1, 30 s, 6 dígitos) para las pruebas de verificación en dos pasos. */
export async function totp(secretBase32: string, at = Date.now()): Promise<string> {
  const { createHmac } = await import("node:crypto");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretBase32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const offset = h[h.length - 1]! & 0xf;
  const code = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}
