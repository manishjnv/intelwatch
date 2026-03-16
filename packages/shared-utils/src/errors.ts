export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly timestamp: string;
  constructor(statusCode: number, message: string, code: string = 'INTERNAL_ERROR', details?: unknown) {
    super(message); this.name = 'AppError'; this.statusCode = statusCode;
    this.code = code; this.details = details; this.timestamp = new Date().toISOString();
    if ('captureStackTrace' in Error && typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, AppError);
    }
  }
  toJSON(): { error: { code: string; message: string; details?: unknown } } {
    return { error: { code: this.code, message: this.message, ...(this.details !== undefined && { details: this.details }) } };
  }
  static isAppError(err: unknown): err is AppError { return err instanceof AppError; }
}
export const Errors = {
  notFound: (entity: string, id?: string) => new AppError(404, `${entity}${id ? ` ${id}` : ''} not found`, 'NOT_FOUND'),
  unauthorized: (reason = 'Authentication required') => new AppError(401, reason, 'UNAUTHORIZED'),
  forbidden: (reason = 'Insufficient permissions') => new AppError(403, reason, 'FORBIDDEN'),
  validation: (message: string, details?: unknown) => new AppError(400, message, 'VALIDATION_ERROR', details),
  conflict: (message: string) => new AppError(409, message, 'CONFLICT'),
  rateLimit: (retryAfter?: number) => new AppError(429, 'Rate limit exceeded', 'RATE_LIMITED', { retryAfter }),
  internal: (message = 'Internal server error') => new AppError(500, message, 'INTERNAL_ERROR'),
  serviceUnavailable: (service: string) => new AppError(503, `${service} is unavailable`, 'SERVICE_UNAVAILABLE'),
  invalidStateTransition: (from: string, to: string) => new AppError(400, `Invalid state transition: ${from} → ${to}`, 'INVALID_STATE_TRANSITION'),
} as const;
