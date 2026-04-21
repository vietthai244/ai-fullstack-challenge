// backend/src/routes/campaigns.ts
//
// Phase 4 — Full implementation (CAMP-01..05, CAMP-08).
// Thin handlers: validate → service → envelope. No business logic here.

import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  CreateCampaignSchema,
  UpdateCampaignSchema,
  OffsetPageQuerySchema,
} from '@campaign/shared';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import * as campaignService from '../services/campaignService.js';
import { BadRequestError } from '../util/errors.js';

export const campaignsRouter: Router = Router();
campaignsRouter.use(authenticate); // <- C7: every route below is guarded

// GET /campaigns — offset-paginated list (CAMP-01, D-16..D-21)
campaignsRouter.get(
  '/',
  validate(OffsetPageQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit } = req.query as unknown as { page: number; limit: number };
      const result = await campaignService.listCampaigns(req.user!.id, page, limit);
      res.json({ data: result.data, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  },
);

// POST /campaigns — create campaign draft (CAMP-02)
campaignsRouter.post(
  '/',
  validate(CreateCampaignSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = await campaignService.createCampaign(req.user!.id, req.body);
      res.status(201).json({ data: campaign });
    } catch (err) {
      next(err);
    }
  },
);

// GET /campaigns/:id — campaign detail with eager-loaded recipients + inline stats (CAMP-03)
campaignsRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaignId = Number(req.params.id);
      if (!Number.isInteger(campaignId) || campaignId <= 0) throw new BadRequestError('INVALID_CAMPAIGN_ID');
      const result = await campaignService.getCampaignDetail(campaignId, req.user!.id);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /campaigns/:id — update campaign (409 if non-draft) (CAMP-04)
campaignsRouter.patch(
  '/:id',
  validate(UpdateCampaignSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaignId = Number(req.params.id);
      if (!Number.isInteger(campaignId) || campaignId <= 0) throw new BadRequestError('INVALID_CAMPAIGN_ID');
      const updated = await campaignService.updateCampaign(campaignId, req.user!.id, req.body);
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /campaigns/:id — delete campaign (409 if non-draft, CASCADE on draft) (CAMP-05)
campaignsRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaignId = Number(req.params.id);
      if (!Number.isInteger(campaignId) || campaignId <= 0) throw new BadRequestError('INVALID_CAMPAIGN_ID');
      await campaignService.deleteCampaign(campaignId, req.user!.id);
      res.json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  },
);

// GET /campaigns/:id/stats — aggregate stats (CAMP-08, T-04-03-03)
// Reuses getCampaignDetail for ownership check — no duplicate WHERE guard needed.
campaignsRouter.get(
  '/:id/stats',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaignId = Number(req.params.id);
      if (!Number.isInteger(campaignId) || campaignId <= 0) throw new BadRequestError('INVALID_CAMPAIGN_ID');
      const campaign = await campaignService.getCampaignDetail(campaignId, req.user!.id);
      res.json({ data: campaign.stats });
    } catch (err) {
      next(err);
    }
  },
);
