// backend/src/middleware/errorHandler.ts
//
// Phase 3: tail error middleware. MUST be the last `app.use(...)` call in
// buildApp() (Express 4 error-middleware contract — 4-arg signature, tail
// position). Plan 04 wires it in app.ts.
//
// Mapping contract:
//   HttpError subclass            -> err.status + { code: err.code, message: err.message }
//   ZodError (belt-and-suspenders — usually caught in validate())
//                                 -> 400 + { code: 'VALIDATION_ERROR', message: 'Invalid request' }
//   SequelizeUniqueConstraintError -> 409 + { code: 'UNIQUE_VIOLATION', message: 'Resource already exists' }
//   SequelizeValidationError       -> 400 + { code: 'VALIDATION_ERROR', message: err.message }
//   everything else                -> 500 + { code: 'INTERNAL_ERROR', message: 'Internal server error' }
//
// Unknown errors are logged via pino with the pino-http-generated reqId so
// server operators can trace a client's INTERNAL_ERROR back to the full
// stack in the logs. The client NEVER receives the stack or raw error text
// (m3 — raw Sequelize errors forwarded to client is a senior-level red flag).

import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../util/errors.js';
import { logger } from '../util/logger.js';

const SEQUELIZE_UNIQUE = 'SequelizeUniqueConstraintError';
const SEQUELIZE_VALIDATION = 'SequelizeValidationError';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request' },
    });
    return;
  }

  if (err && typeof err === 'object' && 'name' in err && err.name === SEQUELIZE_UNIQUE) {
    res.status(409).json({
      error: { code: 'UNIQUE_VIOLATION', message: 'Resource already exists' },
    });
    return;
  }

  if (err && typeof err === 'object' && 'name' in err && err.name === SEQUELIZE_VALIDATION) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: (err as Error).message },
    });
    return;
  }

  logger.error({ err, reqId: (req as { id?: string }).id }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
};
