import pino, { type Logger } from 'pino';

let _logger: Logger | null = null;

/** Initialize the service logger with redaction and structured output. */
export function initLogger(level: string = 'info'): Logger {
  _logger = pino({
    name: 'etip-drp',
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

/** Get the cached logger instance, initializing if needed. */
export function getLogger(): Logger {
  if (!_logger) {
    _logger = pino({ name: 'etip-drp', level: 'info' });
  }
  return _logger;
}
