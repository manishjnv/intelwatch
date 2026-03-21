import pino from 'pino';

export function initLogger(level: string): pino.Logger {
  return pino({
    level,
    transport: process.env.TI_NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  });
}
