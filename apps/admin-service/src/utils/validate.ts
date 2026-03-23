import type { ZodType } from 'zod';
import { AppError } from '@etip/shared-utils';

/** Parse input with a Zod schema; throws AppError(400) on validation failure. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validate<S extends ZodType<any, any, any>>(schema: S, data: unknown): ReturnType<S['parse']> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'Request validation failed', 'VALIDATION_ERROR', details);
  }
  return result.data;
}
