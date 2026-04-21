// backend/src/routes/recipients.ts
//
// Phase 3 STUB — Phase 4 owns the real implementation.
// See backend/src/routes/campaigns.ts for rationale.

import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { NotFoundError } from '../util/errors.js';

export const recipientsRouter: Router = Router();
recipientsRouter.use(authenticate);                // <- C7: every route below is guarded

recipientsRouter.all('/:id', async (_req, _res, next) => {
  next(new NotFoundError('RECIPIENT_NOT_FOUND'));
});

recipientsRouter.all('/', async (_req, _res, next) => {
  next(new NotFoundError('RECIPIENT_NOT_FOUND'));
});
