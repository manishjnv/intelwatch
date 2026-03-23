import pino, { type Logger } from 'pino';

let _logger: Logger | null = null;

/** Create and cache the service logger. */
export function initLogger(level: string = 'info'): Logger {
  _logger = pino({
    name: 'etip-hunting',
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-service-token"]',
        'password',
        'token',
        'secret',
      ],
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

/** Return cached logger (falls back to info level). */
export function getLogger(): Logger {
  if (!_logger) {
    _logger = pino({ name: 'etip-hunting', level: 'info' });
  }
  return _logger;
}
