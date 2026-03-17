import { z } from 'zod';
import { AppError } from '@etip/shared-utils';

export const EnrichmentOutputSchema = z.object({
  riskScore: z.number().int().min(0).max(100),
  confidence: z.number().int().min(0).max(100),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  mitreTechniques: z.array(z.string().regex(/^T\d{4}(\.\d{3})?$/)).default([]),
  threatActors: z.array(z.string().max(200)).default([]),
  malwareFamilies: z.array(z.string().max(200)).default([]),
  reasoning: z.string().max(2000),
  tags: z.array(z.string().max(50)).default([]),
  relatedIOCs: z.array(z.string()).default([]),
  geolocation: z.object({ country: z.string().max(100).optional(), city: z.string().max(100).optional(), asn: z.string().max(50).optional(), asnOrg: z.string().max(200).optional() }).optional(),
});
export type EnrichmentOutput = z.infer<typeof EnrichmentOutputSchema>;

export function validateLLMOutput(rawJson: unknown, iocValue: string): EnrichmentOutput {
  const result = EnrichmentOutputSchema.safeParse(rawJson);
  if (!result.success) { throw new AppError(422, `AI enrichment produced invalid output for IOC: ${iocValue}`, 'LLM_OUTPUT_INVALID', result.error.flatten()); }
  return result.data;
}
