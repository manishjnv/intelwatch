import type { FastifyInstance } from 'fastify';
import { AppError } from '@etip/shared-utils';
import { ZodError } from 'zod';
import { getLogger } from '../logger.js';

/** Duck-type check for ZodError (handles potential module resolution differences). */
function isZodError(err: unknown): err is ZodError {
  return err instanceof ZodError || (typeof err === 'object' && err !== null && 'issues' in err && Array.isArray((err as Record<string, unknown>).issues));
}

/** Fastify plugin that handles AppError, ZodError, rate-limit, and unexpected errors. */
export async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  const logger = getLogger();

  app.setErrorHandler((error: unknown, _req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }

    if (isZodError(error)) {
      const details = (error as ZodError).issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      }));
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details },
      });
    }

    const fastifyError = error as { statusCode?: number };
    if (fastifyError.statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      });
    }

    logger.error({ err: error }, 'Unhandled error in admin-service');
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  app.setNotFoundHandler((_req, reply) => {
    return reply.status(404).send({
      error: { code: 'NOT_FOUND', message: 'Resource not found' },
    });
  });
}
