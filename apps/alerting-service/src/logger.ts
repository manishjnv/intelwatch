import pino, { type Logger } from 'pino';

let _logger: Logger | null = null;

export function initLogger(level: string = 'info'): Logger {
  _logger = pino({
    name: 'etip-alerting-service',
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

export function getLogger(): Logger {
  if (!_logger) _logger = pino({ name: 'etip-alerting-service', level: 'info' });
  return _logger;
}
