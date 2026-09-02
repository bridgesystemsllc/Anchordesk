/**
 * Token cost calculation for AI models.
 * Prices locked per spec: do not update without a spec change.
 */

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15 },
};

export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const cost =
    (promptTokens * pricing.inputPerMillion + completionTokens * pricing.outputPerMillion) /
    1_000_000;

  return Number(cost.toFixed(6));
}
