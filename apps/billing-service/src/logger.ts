import pino, { type Logger } from 'pino';

let _logger: Logger | null = null;

/** Initialize the service logger with the given log level. */
export function initLogger(level: string = 'info'): Logger {
  _logger = pino({
    name: 'etip-billing-service',
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'password',
        'token',
        'secret',
        'apiKey',
        'credentials',
        'razorpayKeySecret',
        'webhookSecret',
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

/** Get the current logger, initializing with defaults if not yet set. */
export function getLogger(): Logger {
  if (!_logger) _logger = pino({ name: 'etip-billing-service', level: 'info' });
  return _logger;
}
