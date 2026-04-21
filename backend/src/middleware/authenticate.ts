// backend/src/middleware/authenticate.ts
//
// Phase 3 (AUTH-06): router-level Bearer-token guard.
//
// Contract:
//   - Reads `Authorization: Bearer <token>` header.
//   - On any failure (missing header, wrong scheme, malformed token, bad
//     signature, expired, wrong `type` claim) → UnauthorizedError. The client
//     sees a single stable error code ('MISSING_TOKEN' or 'INVALID_TOKEN')
//     regardless of the underlying cause — P3-6 defense-in-depth against
//     leaking JWT library internals.
//   - On success, sets `req.user = { id: Number(payload.sub), email: payload.email }`.
//     Downstream services expect `req.user.id` to be a number.
//
// Mount pattern (applied by each protected router, NOT at the app level):
//
//     campaignsRouter.use(authenticate);
//     campaignsRouter.get('/', listCampaigns);
//
// This keeps C7's "every new route added under the router is safe-by-default"
// guarantee. `/track/*` (Phase 6) mounts on a separate PUBLIC router at the
// app level, so it inherits no guard.

import type { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../lib/tokens.js';
import { UnauthorizedError } from '../util/errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: number; email: string };
  }
}

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new UnauthorizedError('MISSING_TOKEN'));
    return;
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccess(token);
    req.user = { id: Number(payload.sub), email: payload.email };
    next();
  } catch {
    // Swallow the underlying error cause — P3-6. A single stable code.
    next(new UnauthorizedError('INVALID_TOKEN'));
  }
}
