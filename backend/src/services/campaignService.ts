// backend/src/services/campaignService.ts
//
// Phase 4 (CAMP-01..05, CAMP-08 business logic):
//   - listCampaigns:      offset pagination (D-16..D-21), findAndCountAll
//   - createCampaign:     single transaction — upsert recipients → create campaign → bulkCreate CampaignRecipient
//   - getCampaignDetail:  eager-load (no N+1, C1) + computeCampaignStats in one call
//   - updateCampaign:     atomic UPDATE WHERE status='draft' RETURNING — zero rows → ConflictError (C10, C11)
//   - deleteCampaign:     transaction wrapping findOne + atomic guard + destroy (C11 TOCTOU defense)
//   - computeCampaignStats: single COUNT(*) FILTER aggregate SQL — no JS counting (CLAUDE.md §3)
//   - upsertRecipientsByEmail (private): ON CONFLICT DO UPDATE SET email = EXCLUDED.email RETURNING id (D-15)

import { QueryTypes, Op } from 'sequelize';
import { sequelize, Campaign, Recipient, CampaignRecipient } from '../db/index.js';
import { ConflictError, NotFoundError, BadRequestError } from '../util/errors.js';
import type { Transaction } from 'sequelize';
import { sendQueue } from '../lib/queue.js';
import type { CreateCampaignInput, UpdateCampaignInput, Stats } from '@campaign/shared';

// ---------------------------------------------------------------------------
// Private helper: upsert recipients by email for a given user
// Returns the id[] (as strings — Postgres BIGINT) for ALL provided emails,
// whether newly inserted or pre-existing. D-15: no-op update trick so that
// ON CONFLICT RETURNING id works for both branches.
// ---------------------------------------------------------------------------
async function upsertRecipientsByEmail(
  userId: number,
  emails: string[],
  t: Transaction,
): Promise<string[]> {
  if (emails.length === 0) return [];

  const values = emails.map((_, i) => `(:userId, :email${i}, NOW(), NOW())`).join(', ');
  const replacements: Record<string, unknown> = { userId };
  emails.forEach((email, i) => {
    replacements[`email${i}`] = email;
  });

  const rows = await sequelize.query<{ id: string }>(
    `INSERT INTO recipients (user_id, email, created_at, updated_at)
     VALUES ${values}
     ON CONFLICT (user_id, email)
       DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    { replacements, type: QueryTypes.SELECT, transaction: t },
  );
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// listCampaigns — offset pagination (D-16..D-21)
// GET /campaigns?page=1&limit=20 → { data, pagination: { page, limit, total, totalPages } }
// ---------------------------------------------------------------------------
export async function listCampaigns(
  userId: number,
  page: number,
  limit: number,
): Promise<{
  data: Campaign[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const { rows, count } = await Campaign.findAndCountAll({
    where: { createdBy: userId },
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit,
    offset: (page - 1) * limit,
  });

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// createCampaign — single transaction (C11)
// Step 1: upsert recipients
// Step 2: create campaign (status = 'draft')
// Step 3: bulkCreate CampaignRecipient rows (pending)
// ---------------------------------------------------------------------------
export async function createCampaign(
  userId: number,
  input: CreateCampaignInput,
): Promise<Campaign> {
  return sequelize.transaction(async (t) => {
    const recipientIds = await upsertRecipientsByEmail(userId, input.recipientEmails, t);

    const campaign = await Campaign.create(
      {
        name: input.name,
        subject: input.subject,
        body: input.body,
        createdBy: userId,
      },
      { transaction: t },
    );

    if (recipientIds.length > 0) {
      await CampaignRecipient.bulkCreate(
        recipientIds.map((rid) => ({
          campaignId: campaign.id,
          recipientId: Number(rid),
          status: 'pending' as const,
        })),
        { transaction: t, ignoreDuplicates: true },
      );
    }

    return campaign;
  });
}

// ---------------------------------------------------------------------------
// getCampaignDetail — eager-load recipients + stats (no N+1, C1)
// ---------------------------------------------------------------------------
export async function getCampaignDetail(
  campaignId: number,
  userId: number,
): Promise<Record<string, unknown>> {
  const campaign = await Campaign.findOne({
    where: { id: campaignId, createdBy: userId },
    include: [
      {
        model: CampaignRecipient,
        as: 'campaignRecipients',
        include: [
          {
            model: Recipient,
            as: 'recipient',
            attributes: ['id', 'email', 'name'],
          },
        ],
        attributes: ['status', 'sentAt', 'openedAt', 'trackingToken'],
      },
    ],
  });

  if (!campaign) throw new NotFoundError('CAMPAIGN_NOT_FOUND');

  const stats = await computeCampaignStats(campaignId);
  return { ...campaign.toJSON(), stats };
}

// ---------------------------------------------------------------------------
// updateCampaign — atomic status guard (C10, C11, D-25)
// PATCH /campaigns/:id — only allowed when status = 'draft'
// If recipientEmails provided: full replace inside same tx (D-06)
// ---------------------------------------------------------------------------
export async function updateCampaign(
  campaignId: number,
  userId: number,
  input: UpdateCampaignInput,
): Promise<Campaign> {
  return sequelize.transaction(async (t) => {
    // Atomic guard — zero rows → campaign non-draft OR not owned by user
    const results = await sequelize.query<{ id: string }>(
      `UPDATE campaigns
       SET name = COALESCE(:name, name),
           subject = COALESCE(:subject, subject),
           body = COALESCE(:body, body),
           updated_at = NOW()
       WHERE id = :id AND created_by = :userId AND status = 'draft'
       RETURNING id`,
      {
        replacements: {
          id: campaignId,
          userId,
          name: input.name ?? null,
          subject: input.subject ?? null,
          body: input.body ?? null,
        },
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );

    if (!results || results.length === 0) {
      throw new ConflictError('CAMPAIGN_NOT_EDITABLE');
    }

    if (input.recipientEmails !== undefined) {
      // Full replace (D-06): upsert new emails → destroy old CampaignRecipient rows → insert new ones
      const newIds = await upsertRecipientsByEmail(userId, input.recipientEmails, t);
      await CampaignRecipient.destroy({ where: { campaignId }, transaction: t });
      if (newIds.length > 0) {
        await CampaignRecipient.bulkCreate(
          newIds.map((rid) => ({
            campaignId,
            recipientId: Number(rid),
            status: 'pending' as const,
          })),
          { transaction: t, ignoreDuplicates: true },
        );
      }
    }

    const refreshed = await Campaign.findOne({ where: { id: campaignId }, transaction: t });
    if (!refreshed) throw new NotFoundError('CAMPAIGN_NOT_FOUND');
    return refreshed;
  });
}

// ---------------------------------------------------------------------------
// deleteCampaign — all 3 steps in transaction (C11 TOCTOU defense)
// Step 1: findOne (404 if not found)
// Step 2: Campaign.update WHERE status='draft' (409 if not editable)
// Step 3: Campaign.destroy (cascade handles CampaignRecipient)
// ---------------------------------------------------------------------------
export async function deleteCampaign(campaignId: number, userId: number): Promise<void> {
  await sequelize.transaction(async (t) => {
    const campaign = await Campaign.findOne({
      where: { id: campaignId, createdBy: userId },
      transaction: t,
    });
    if (!campaign) throw new NotFoundError('CAMPAIGN_NOT_FOUND');

    const [count] = await Campaign.update(
      { updatedAt: new Date() },
      { where: { id: campaignId, createdBy: userId, status: 'draft' }, transaction: t },
    );
    if (count === 0) throw new ConflictError('CAMPAIGN_NOT_EDITABLE');

    await Campaign.destroy({ where: { id: campaignId, createdBy: userId }, transaction: t });
  });
}

// ---------------------------------------------------------------------------
// computeCampaignStats — single SQL aggregate (CLAUDE.md §3, D-09)
// COUNT(*) FILTER — no JS counting ever.
// NULLIF guards divide-by-zero for open_rate and send_rate.
// Exported — used by GET /campaigns/:id and GET /campaigns/:id/stats
// ---------------------------------------------------------------------------
export async function computeCampaignStats(
  campaignId: number,
  opts: { transaction?: Transaction } = {},
): Promise<Stats> {
  const [row] = await sequelize.query<{
    total: string;
    sent: string;
    failed: string;
    opened: string;
    open_rate: string | null;
    send_rate: string | null;
  }>(
    `SELECT
       COUNT(*)                                      AS total,
       COUNT(*) FILTER (WHERE status = 'sent')       AS sent,
       COUNT(*) FILTER (WHERE status = 'failed')     AS failed,
       COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
       ROUND(
         COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::numeric
         / NULLIF(COUNT(*), 0),
         2
       ) AS open_rate,
       ROUND(
         (COUNT(*) FILTER (WHERE status = 'sent') + COUNT(*) FILTER (WHERE status = 'failed'))::numeric
         / NULLIF(COUNT(*), 0),
         2
       ) AS send_rate
     FROM campaign_recipients
     WHERE campaign_id = :campaignId`,
    {
      replacements: { campaignId },
      type: QueryTypes.SELECT,
      ...(opts.transaction ? { transaction: opts.transaction } : {}),
    },
  );

  // row is always present for aggregate queries (returns one row even when no matching data)
  const r = row ?? { total: '0', sent: '0', failed: '0', opened: '0', open_rate: null, send_rate: null };

  return {
    total: parseInt(r.total, 10),
    sent: parseInt(r.sent, 10),
    failed: parseInt(r.failed, 10),
    opened: parseInt(r.opened, 10),
    open_rate: r.open_rate !== null ? parseFloat(r.open_rate) : null,
    send_rate: r.send_rate !== null ? parseFloat(r.send_rate) : null,
  };
}

// ---------------------------------------------------------------------------
// triggerSend — atomic guard + immediate enqueue (CAMP-07, C11)
// UPDATE WHERE status IN ('draft','scheduled') is the lock — rowCount=0 → 409.
// No findOne before UPDATE — that would be a TOCTOU race (C11).
// AUTH-07: createdBy: userId ensures users can only send their own campaigns.
// ---------------------------------------------------------------------------
export async function triggerSend(campaignId: number, userId: number): Promise<void> {
  const [count] = await Campaign.update(
    { status: 'sending' },
    {
      where: {
        id: campaignId,
        createdBy: userId,
        status: { [Op.in]: ['draft', 'scheduled'] },
      },
    },
  );
  if (count === 0) throw new ConflictError('CAMPAIGN_NOT_SENDABLE');
  try {
    await sendQueue.add('send-campaign', { campaignId, userId });
  } catch (enqueueErr) {
    // Roll back status so the campaign is not permanently stranded if Redis is unavailable
    await Campaign.update({ status: 'draft' }, { where: { id: campaignId } });
    throw enqueueErr;
  }
}

// ---------------------------------------------------------------------------
// scheduleCampaign — validate future date + transition draft→scheduled + delayed enqueue (CAMP-06)
// Business rule: past scheduled_at → 400 (service layer, not Zod, so error code is explicit).
// AUTH-07: createdBy: userId in WHERE ensures users can only schedule their own campaigns.
// ---------------------------------------------------------------------------
export async function scheduleCampaign(
  campaignId: number,
  userId: number,
  scheduledAt: string,
): Promise<void> {
  const scheduledDate = new Date(scheduledAt);
  if (scheduledDate <= new Date()) throw new BadRequestError('SCHEDULED_AT_NOT_FUTURE');

  const [count] = await Campaign.update(
    { status: 'scheduled', scheduledAt: scheduledDate },
    {
      where: {
        id: campaignId,
        createdBy: userId,
        status: 'draft',
      },
    },
  );
  if (count === 0) throw new ConflictError('CAMPAIGN_NOT_SCHEDULABLE');

  const delay = scheduledDate.getTime() - Date.now();
  try {
    await sendQueue.add('send-campaign', { campaignId, userId }, { delay });
  } catch (enqueueErr) {
    // Roll back status so the campaign is not permanently stranded if Redis is unavailable
    await Campaign.update({ status: 'draft' }, { where: { id: campaignId } });
    throw enqueueErr;
  }
}
