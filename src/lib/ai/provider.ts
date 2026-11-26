import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { SCHEMAS, SYSTEM_PROMPTS, simulate, type AiFeature, type AiOutput, type SimInput } from "@/lib/ai/features";
import { costUsd } from "@/lib/ai/pricing";

/** Resultado normalizado de cualquier proveedor. */
export interface AiResult<F extends AiFeature> {
  output: AiOutput<F>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Interfaz común: cambiar de proveedor no obliga a reescribir las funciones. */
export interface AiProvider {
  name: "simulado" | "anthropic";
  run<F extends AiFeature>(feature: F, prompt: string, sim: SimInput): Promise<AiResult<F>>;
}

/** Proveedor simulado: no envía datos a ningún servicio (desarrollo, pruebas y TEST). */
export const simulatedProvider: AiProvider = {
  name: "simulado",
  async run(feature, prompt, sim) {
    const output = SCHEMAS[feature].parse(simulate(feature, sim)) as AiOutput<typeof feature>;
    return { output, model: "simulado-1", inputTokens: Math.ceil(prompt.length / 4), outputTokens: Math.ceil(JSON.stringify(output).length / 4), costUsd: 0 };
  },
};

export class AiProviderError extends Error {}

/**
 * Proveedor Anthropic (Claude). Solo se usa si administración lo activó con
 * acuerdo de tratamiento de datos y presupuesto, y si existe el secreto
 * ANTHROPIC_API_KEY en el servidor. Salida estructurada validada con Zod.
 */
export function anthropicProvider(model: string): AiProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new AiProviderError("El proveedor de IA no está configurado en el servidor.");
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  return {
    name: "anthropic",
    async run(feature, prompt) {
      try {
        const response = await client.beta.messages.parse({
          model,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM_PROMPTS[feature],
          output_config: { effort: "medium", format: betaZodOutputFormat(SCHEMAS[feature]) },
          messages: [{ role: "user", content: prompt }],
        });
        if (response.stop_reason === "refusal") throw new AiProviderError("El proveedor no generó un resultado para esta solicitud.");
        if (response.stop_reason === "max_tokens") throw new AiProviderError("El resultado fue demasiado largo. Intente con menos información.");
        const output = response.parsed_output;
        if (!output) throw new AiProviderError("El resultado no tiene el formato esperado.");
        const inputTokens = response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0);
        const outputTokens = response.usage.output_tokens;
        return { output: output as AiOutput<typeof feature>, model: response.model, inputTokens, outputTokens, costUsd: costUsd(response.model, inputTokens, outputTokens) };
      } catch (err) {
        if (err instanceof AiProviderError) throw err;
        if (err instanceof Anthropic.RateLimitError) throw new AiProviderError("El proveedor de IA está saturado. Intente en unos minutos.");
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new AiProviderError("Credencial del proveedor de IA inválida. Avise a administración.");
        if (err instanceof Anthropic.APIError) throw new AiProviderError("El proveedor de IA no respondió correctamente.");
        throw new AiProviderError("No fue posible contactar al proveedor de IA.");
      }
    },
  };
}
