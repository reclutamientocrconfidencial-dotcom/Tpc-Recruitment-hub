import type { NextConfig } from "next";

// Origen de Supabase permitido para conexiones del navegador (se fija al compilar).
function supabaseOrigins(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return "";
  try {
    const { origin, host } = new URL(url);
    return `${origin} wss://${host}`;
  } catch {
    return "";
  }
}

const isDev = process.env.NODE_ENV === "development";

// Next.js inyecta scripts en línea para la hidratación; por eso 'unsafe-inline' en script-src.
// Fase futura: CSP con nonce desde el middleware para eliminarlo.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins()}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Cloudflare Workers no ejecuta el optimizador de imágenes de Next.js.
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

// Habilita los bindings de Cloudflare (wrangler) durante `next dev`.
if (process.env.NODE_ENV === "development" && process.env.CF_DEV_BINDINGS === "true") {
  void import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
}
