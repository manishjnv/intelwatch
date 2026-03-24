/**
 * @module logger
 * @description Pino logger singleton for caching-service.
 */
import pino, { type Logger } from 'pino';

let _logger: Logger | null = null;

/** Initialize the logger with the specified level. */
export function initLogger(level: string = 'info'): Logger {
  _logger = pino({
    name: 'etip-caching-service',
    level,
    redact: {
      paths: ['req.headers.authorization', 'password', 'token', 'secret', 'apiKey'],
      censor: '[REDACTED]',
    },
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      err: pino.stdSerializers.err,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return _logger;
}

/** Get the logger instance. Initializes with defaults if not yet created. */
export function getLogger(): Logger {
  if (!_logger) _logger = pino({ name: 'etip-caching-service', level: 'info' });
  return _logger;
}
