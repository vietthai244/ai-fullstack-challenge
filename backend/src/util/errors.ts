// backend/src/util/errors.ts
//
// Phase 3: HttpError class hierarchy — the single source of truth for API
// error responses. Services throw these; route handlers forward via
// `catch(err) { next(err) }`; the tail `errorHandler` middleware serializes
// them into the `{ error: { code, message } }` shape CLAUDE.md locks as the
// whole-API convention.

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = this.constructor.name;
  }
}

export class BadRequestError extends HttpError {
  constructor(code = 'BAD_REQUEST', message?: string) {
    super(400, code, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(code = 'UNAUTHORIZED', message?: string) {
    super(401, code, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(code = 'FORBIDDEN', message?: string) {
    super(403, code, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(code = 'NOT_FOUND', message?: string) {
    super(404, code, message);
  }
}

export class ConflictError extends HttpError {
  constructor(code = 'CONFLICT', message?: string) {
    super(409, code, message);
  }
}

export class ValidationError extends HttpError {
  constructor(
    message = 'Validation failed',
    public readonly details?: unknown,
  ) {
    super(400, 'VALIDATION_ERROR', message);
  }
}
