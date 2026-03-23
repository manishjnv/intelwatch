import pino, { type Logger } from 'pino';

let _logger: Logger | null = null;

/** Initialize the service logger with redaction rules. */
export function initLogger(level: string = 'info'): Logger {
  _logger = pino({
    name: 'etip-user-management-service',
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-service-token"]',
        'password',
        'token',
        'secret',
        'apiKey',
        'credentials',
        'totpSecret',
        'backupCodes',
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

/** Return cached logger. Creates default if not initialized. */
export function getLogger(): Logger {
  if (!_logger) {
    _logger = pino({ name: 'etip-user-management-service', level: 'info' });
  }
  return _logger;
}
