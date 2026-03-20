import type { FastifyInstance, FastifyError } from 'fastify';
import { AppError } from '@etip/shared-utils';
import { ZodError } from 'zod';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, req, reply) => {
    const logger = req.log || app.log;

    if (error instanceof AppError) {
      if (error.statusCode >= 500) logger.error({ err: error, code: error.code }, error.message);
      else logger.warn({ code: error.code, statusCode: error.statusCode }, error.message);
      return reply.status(error.statusCode).send(error.toJSON());
    }

    if (error instanceof ZodError) {
      const details = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message, code: issue.code }));
      logger.warn({ validationErrors: details }, 'Validation error');
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details } });
    }

    if ('statusCode' in error && typeof error.statusCode === 'number') {
      const statusCode = error.statusCode;
      if (statusCode === 429) {
        logger.warn({ ip: req.ip }, 'Rate limit exceeded');
        return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests — please slow down' } });
      }
      logger.warn({ statusCode, message: error.message }, 'Fastify error');
      return reply.status(statusCode).send({ error: { code: 'REQUEST_ERROR', message: error.message } });
    }

    logger.error({ err: error }, 'Unhandled error');
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  });

  app.setNotFoundHandler((_req, reply) => {
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
}
