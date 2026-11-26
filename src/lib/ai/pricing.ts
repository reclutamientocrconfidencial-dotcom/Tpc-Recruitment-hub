/**
 * Precios por millón de tokens (USD) de los modelos permitidos. Se usan para
 * registrar el costo de cada consulta. Actualizar si el proveedor cambia precios.
 */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
};

export const ALLOWED_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;

/** Costo en USD; con un modelo desconocido se usa el precio más alto conocido (estimación conservadora). */
export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICES[model] ?? { input: 5, output: 25 };
  return Math.round(((inputTokens * p.input + outputTokens * p.output) / 1_000_000) * 10_000) / 10_000;
}
