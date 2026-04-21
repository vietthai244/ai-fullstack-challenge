import { z } from 'zod';

export const CampaignStatusEnum = z.enum(['draft', 'scheduled', 'sending', 'sent']);
export type CampaignStatus = z.infer<typeof CampaignStatusEnum>;

// D-26 — Campaign CRUD schemas

export const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(998),
  body: z.string().min(1),
  recipientEmails: z.array(z.string().email()).min(1),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

export const UpdateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(998).optional(),
  body: z.string().min(1).optional(),
  recipientEmails: z.array(z.string().email()).min(1).optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' },
);
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;

// D-16..D-21 — Offset pagination for GET /campaigns
export const OffsetPageQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10000).default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type OffsetPageQuery = z.infer<typeof OffsetPageQuerySchema>;

// D-21r — Cursor pagination for GET /recipients
export const CursorPageQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().optional(),
});
export type CursorPageQuery = z.infer<typeof CursorPageQuerySchema>;

// D-09 — Stats shape (single-SQL aggregate, never JS-computed counters)
export const StatsSchema = z.object({
  total: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  opened: z.number().int().nonnegative(),
  open_rate: z.number().nullable(),
  send_rate: z.number().nullable(),
});
export type Stats = z.infer<typeof StatsSchema>;

// D-26 — Campaign response shape (BIGINT id as string — confirmed Phase 3)
export const CampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  body: z.string(),
  status: CampaignStatusEnum,
  scheduledAt: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Campaign = z.infer<typeof CampaignSchema>;
