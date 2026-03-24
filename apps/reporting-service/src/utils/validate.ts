import type { ZodType } from 'zod';
import { AppError } from '@etip/shared-utils';

export function validate<S extends ZodType<unknown>>(schema: S, data: unknown): ReturnType<S['parse']> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'Request validation failed', 'VALIDATION_ERROR', details);
  }
  return result.data as ReturnType<S['parse']>;
}
