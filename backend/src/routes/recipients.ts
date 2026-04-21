// backend/src/routes/recipients.ts
//
// Phase 4 — Full implementation (RECIP-01, RECIP-02).
// Thin handlers: validate → service → envelope. No business logic here.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { CreateRecipientSchema, CursorPageQuerySchema } from '@campaign/shared';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import * as recipientService from '../services/recipientService.js';

export const recipientsRouter: Router = Router();
recipientsRouter.use(authenticate); // <- C7: every route below is guarded

// POST /recipients — upsert recipient by email (RECIP-01, D-14 COALESCE name-preserving)
recipientsRouter.post(
  '/',
  validate(CreateRecipientSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recipient = await recipientService.upsertRecipient(req.user!.id, req.body);
      res.status(201).json({ data: recipient });
    } catch (err) {
      next(err);
    }
  },
);

// GET /recipients — cursor-paginated list (RECIP-02, C16 composite cursor)
recipientsRouter.get(
  '/',
  validate(CursorPageQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit, cursor } = req.query as unknown as { limit: number; cursor?: string };
      const result = await recipientService.listRecipients(req.user!.id, limit, cursor);
      res.json({ data: result.data, nextCursor: result.nextCursor, hasMore: result.hasMore });
    } catch (err) {
      next(err);
    }
  },
);
