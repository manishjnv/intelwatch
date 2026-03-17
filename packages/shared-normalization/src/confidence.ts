import { z } from 'zod';

export const CONFIDENCE_WEIGHTS = { feedReliability: 0.30, corroboration: 0.25, aiScore: 0.25, communityVotes: 0.20 } as const;

export const ConfidenceSignalSchema = z.object({
  feedReliability: z.number().min(0).max(100),
  corroboration: z.number().min(0).max(100),
  aiScore: z.number().min(0).max(100),
  communityVotes: z.number().min(0).max(100),
});
export type ConfidenceSignal = z.infer<typeof ConfidenceSignalSchema>;

export interface CompositeConfidence {
  score: number; signals: ConfidenceSignal; daysSinceLastSeen: number; decayFactor: number;
}

export function calculateCompositeConfidence(signals: ConfidenceSignal, daysSinceLastSeen: number): CompositeConfidence {
  const validated = ConfidenceSignalSchema.parse(signals);
  const raw = CONFIDENCE_WEIGHTS.feedReliability * validated.feedReliability + CONFIDENCE_WEIGHTS.corroboration * validated.corroboration + CONFIDENCE_WEIGHTS.aiScore * validated.aiScore + CONFIDENCE_WEIGHTS.communityVotes * validated.communityVotes;
  const decayFactor = Math.exp(-0.01 * Math.max(0, daysSinceLastSeen));
  const score = Math.round(raw * decayFactor);
  return { score: Math.min(100, Math.max(0, score)), signals: validated, daysSinceLastSeen, decayFactor: Math.round(decayFactor * 1000) / 1000 };
}
