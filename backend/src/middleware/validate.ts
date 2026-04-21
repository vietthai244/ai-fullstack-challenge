// backend/src/middleware/validate.ts
//
// Phase 3: Zod validation middleware factory. Used at the HTTP boundary
// before any controller code runs — downstream handlers can treat
// `req.body | req.params | req.query` as trusted, typed values.
//
// On validation failure, throws ValidationError (-> 400 VALIDATION_ERROR via
// errorHandler). On success, REPLACES `req[source]` with the parsed+coerced
// Zod output so handlers see the narrowed type, not the raw input.

import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { ValidationError } from '../util/errors.js';

export function validate<T>(
  schema: ZodSchema<T>,
  source: 'body' | 'params' | 'query' = 'body',
): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        new ValidationError('Invalid request', result.error.flatten()),
      );
    }
    (req as unknown as Record<string, unknown>)[source] = result.data;
    return next();
  };
}
