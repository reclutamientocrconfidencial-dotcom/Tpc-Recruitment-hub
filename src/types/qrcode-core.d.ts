// Núcleo del generador de QR (sin dependencias de Node: compatible con Cloudflare Workers).
declare module "qrcode/lib/core/qrcode" {
  export function create(
    text: string,
    options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" },
  ): { modules: { size: number; data: Uint8Array | boolean[] } };
}
