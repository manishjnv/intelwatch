/**
 * @module @etip/shared-utils/errors
 * @description Structured error class for the entire platform.
 * All services throw AppError — never raw Error().
 *
 * Source: 00-MASTER.md
 */

/**
 * Standard application error with HTTP status code, machine-readable code,
 * and optional structured details. Every catch block should use this.
 *
 * @example
 * ```typescript
 * throw new AppError(404, 'IOC not found', 'NOT_FOUND');
 * throw new AppError(400, 'Invalid IP', 'VALIDATION_ERROR', { field: 'value' });
 * ```
 */
export class AppError extends Error {
  /** HTTP status code (4xx or 5xx) */
  public readonly statusCode: number;
  /** Machine-readable error code for client consumption */
  public readonly code: string;
  /** Optional structured details (validation errors, context, etc.) */
  public readonly details?: unknown;
  /** ISO timestamp when the error occurred */
  public readonly timestamp: string;

  constructor(
    statusCode: number,
    message: string,
    code: string = 'INTERNAL_ERROR',
    details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /** Serialize to standard error response shape */
  toJSON(): { error: { code: string; message: string; details?: unknown } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined && { details: this.details }),
      },
    };
  }

  /** Check if an unknown value is an AppError instance */
  static isAppError(err: unknown): err is AppError {
    return err instanceof AppError;
  }
}

/** Common pre-built errors for convenience */
export const Errors = {
  notFound: (entity: string, id?: string) =>
    new AppError(404, `${entity}${id ? ` ${id}` : ''} not found`, 'NOT_FOUND'),

  unauthorized: (reason = 'Authentication required') =>
    new AppError(401, reason, 'UNAUTHORIZED'),

  forbidden: (reason = 'Insufficient permissions') =>
    new AppError(403, reason, 'FORBIDDEN'),

  validation: (message: string, details?: unknown) =>
    new AppError(400, message, 'VALIDATION_ERROR', details),

  conflict: (message: string) =>
    new AppError(409, message, 'CONFLICT'),

  rateLimit: (retryAfter?: number) =>
    new AppError(429, 'Rate limit exceeded', 'RATE_LIMITED', { retryAfter }),

  internal: (message = 'Internal server error') =>
    new AppError(500, message, 'INTERNAL_ERROR'),

  serviceUnavailable: (service: string) =>
    new AppError(503, `${service} is unavailable`, 'SERVICE_UNAVAILABLE'),

  invalidStateTransition: (from: string, to: string) =>
    new AppError(400, `Invalid state transition: ${from} → ${to}`, 'INVALID_STATE_TRANSITION'),
} as const;
