/**
 * Application errors carry an HTTP status, a stable machine-readable code and a
 * message that is always safe to show to end users. Anything that is not an
 * AppError is treated as an unexpected 500 and its details are never sent to
 * the client.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details);
export const validationError = (message: string, details?: unknown) =>
  new AppError(422, "VALIDATION_ERROR", message, details);
export const unauthorized = (message = "Please sign in to continue.") =>
  new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have permission to do that.") =>
  new AppError(403, "FORBIDDEN", message);
export const notFound = (resource = "Resource") =>
  new AppError(404, "NOT_FOUND", `${resource} not found.`);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);
export const tooManyRequests = (message = "Too many requests. Please slow down and try again shortly.") =>
  new AppError(429, "RATE_LIMITED", message);

/**
 * Thrown inside a transaction when an optimistic-concurrency precondition
 * fails (another request changed the document first). The transaction runner
 * treats it like a MongoDB TransientTransactionError and retries from scratch.
 */
export class ConcurrencyConflictError extends Error {
  constructor(message = "Concurrent modification detected") {
    super(message);
    this.name = "ConcurrencyConflictError";
  }
}
