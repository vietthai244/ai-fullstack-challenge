// backend/src/routes/campaigns.ts
//
// Phase 3 STUB — Phase 4 owns the real implementation.
//
// Why a stub exists in Phase 3:
//   - Proves AUTH-06 (no bearer → 401) end-to-end, because router-level
//     `authenticate` is the thing being tested.
//   - Locks the router-level auth mount pattern before Phase 4 adds real
//     routes. C7 "authenticate missing from routes" is the hardest failure
//     mode to notice in review — the mount shape is the defense.
//   - Provides something concrete to smoke-test the `{error:{code,message}}`
//     shape against.
//
// Every request to any path under /campaigns/* returns 404 — strictly
// superset of AUTH-07's "cross-user returns 404" (because every lookup is a
// cross-user lookup when there's no data yet). Phase 4 replaces the stub
// with real list / create / detail / patch / delete / send / schedule / stats
// handlers that keep the service-layer ownership filter.

import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { NotFoundError } from '../util/errors.js';

export const campaignsRouter: Router = Router();
campaignsRouter.use(authenticate);                 // <- C7: every route below is guarded

// Phase 4 replaces this. For now, ANY authenticated request to any path
// under /campaigns returns 404 — correct shape for AUTH-07 verification.
campaignsRouter.all('/:id', async (_req, _res, next) => {
  next(new NotFoundError('CAMPAIGN_NOT_FOUND'));
});

campaignsRouter.all('/', async (_req, _res, next) => {
  next(new NotFoundError('CAMPAIGN_NOT_FOUND'));
});
