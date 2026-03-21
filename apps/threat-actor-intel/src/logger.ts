import pino from 'pino';

/** Creates a Pino logger with standard ETIP redaction rules. */
export function createLogger(level: string = 'info'): pino.Logger {
  return pino({
    level,
    name: 'etip-threat-actor-intel',
    redact: {
      paths: [
        'password', 'passwordHash', 'password_hash',
        'refreshToken', 'refresh_token', 'accessToken', 'access_token', 'authorization',
        'req.headers.authorization', 'req.headers["x-service-token"]', 'req.headers.cookie',
        'apiKey', 'api_key', 'keyHash', 'key_hash',
        'TI_JWT_SECRET', 'TI_SERVICE_JWT_SECRET', 'TI_REDIS_PASSWORD', 'TI_POSTGRES_PASSWORD',
      ],
      censor: '[REDACTED]',
    },
    serializers: { req: pino.stdSerializers.req, res: pino.stdSerializers.res, err: pino.stdSerializers.err },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

let _logger: pino.Logger | null = null;

/** Initializes the singleton logger at the given level. */
export function initLogger(level: string): pino.Logger {
  _logger = createLogger(level);
  return _logger;
}

/** Returns the singleton logger (auto-creates at 'info' if not initialized). */
export function getLogger(): pino.Logger {
  if (!_logger) _logger = createLogger('info');
  return _logger;
}
