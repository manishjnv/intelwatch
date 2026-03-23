import type { FastifyInstance } from 'fastify';
import { AppError } from '@etip/shared-utils';
import { ZodError } from 'zod';
import { getLogger } from '../logger.js';

export async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  const logger = getLogger();

  app.setErrorHandler((error: unknown, _req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }

    if (error instanceof ZodError) {
      const details = error.issues.map((i) => ({
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

    logger.error({ err: error }, 'Unhandled error');
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
