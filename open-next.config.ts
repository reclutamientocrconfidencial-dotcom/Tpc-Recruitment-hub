import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Configuración mínima: sin caché incremental en R2/KV para mantenerse en el plan gratuito.
// Ver docs/ARQUITECTURA.md para habilitarla en fases futuras.
export default defineCloudflareConfig({});
