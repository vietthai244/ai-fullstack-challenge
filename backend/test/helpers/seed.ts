// backend/test/helpers/seed.ts
//
// Database seed helpers for test setup.
// All helpers use direct Model operations (no service layer) — tests exercise service via HTTP.
// BIGINT note: Campaign.id returned as string by pg. Use Number(campaign.id) for URL construction.

import { sequelize, Campaign, Recipient, CampaignRecipient } from '../../src/db/index.js';
import type { RecipientStatus } from '../../src/models/campaignRecipient.js';

// ---------------------------------------------------------------------------
// seedDraftCampaign — creates a draft campaign with one seeded recipient
// ---------------------------------------------------------------------------
export async function seedDraftCampaign(userId: number | string): Promise<Campaign> {
  return sequelize.transaction(async (t) => {
    const recipient = await Recipient.create(
      {
        userId: Number(userId),
        email: `seed-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        name: 'Seed Recipient',
      },
      { transaction: t },
    );

    const campaign = await Campaign.create(
      {
        name: 'Draft Campaign',
        subject: 'Draft Subject',
        body: 'Draft body.',
        createdBy: Number(userId),
        // status defaults to 'draft'
      },
      { transaction: t },
    );

    await CampaignRecipient.create(
      {
        campaignId: Number(campaign.id),
        recipientId: Number(recipient.id),
        status: 'pending',
      },
      { transaction: t },
    );

    return campaign;
  });
}

// ---------------------------------------------------------------------------
// seedSentCampaign — creates a campaign with status='sent' (bypasses state machine)
// Used for TEST-01: status guards must reject PATCH/DELETE/send on sent campaigns.
// ---------------------------------------------------------------------------
export async function seedSentCampaign(userId: number | string): Promise<Campaign> {
  const recipient = await Recipient.create({
    userId: Number(userId),
    email: `seed-sent-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    name: 'Sent Recipient',
  });

  const campaign = await Campaign.create({
    name: 'Sent Campaign',
    subject: 'Sent Subject',
    body: 'Sent body.',
    createdBy: Number(userId),
    status: 'sent',
  });

  await CampaignRecipient.create({
    campaignId: Number(campaign.id),
    recipientId: Number(recipient.id),
    status: 'sent',
    sentAt: new Date(),
  });

  return campaign;
}

// ---------------------------------------------------------------------------
// seedCampaignWithRecipients — seeds a campaign with a known status distribution
// Used for TEST-03 stats aggregation correctness.
//
// distribution: array of { status: RecipientStatus, openedAt?: Date | null }
// Returns the campaign instance. The caller asserts stats via the API.
// ---------------------------------------------------------------------------
export async function seedCampaignWithRecipients(
  userId: number | string,
  distribution: Array<{ status: RecipientStatus; openedAt?: Date | null }>,
): Promise<Campaign> {
  return sequelize.transaction(async (t) => {
    const campaign = await Campaign.create(
      {
        name: 'Stats Campaign',
        subject: 'Stats Subject',
        body: 'Stats body.',
        createdBy: Number(userId),
        status: 'sent',
      },
      { transaction: t },
    );

    for (const row of distribution) {
      const recipient = await Recipient.create(
        {
          userId: Number(userId),
          email: `seed-stats-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
          name: 'Stats Recipient',
        },
        { transaction: t },
      );

      await CampaignRecipient.create(
        {
          campaignId: Number(campaign.id),
          recipientId: Number(recipient.id),
          status: row.status,
          sentAt: row.status === 'sent' ? new Date() : null,
          openedAt: row.openedAt ?? null,
        },
        { transaction: t },
      );
    }

    return campaign;
  });
}
