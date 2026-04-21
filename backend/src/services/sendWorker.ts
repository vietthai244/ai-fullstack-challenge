// backend/src/services/sendWorker.ts
//
// Phase 5: BullMQ processor function for the 'send-campaign' queue.
//
// QUEUE-03: Re-checks campaign status before any DB writes. A delayed job
// may fire after the campaign was deleted or its status changed — bail cleanly
// with a log (not an error; BullMQ must NOT mark the job failed for a stale bail).
//
// QUEUE-02: All DB mutations are wrapped in a single Sequelize transaction so
// partial state is impossible on crash (C9).
//
// C4: NO try/catch around the sequelize.transaction() call. Errors must
// propagate so BullMQ catches them and marks the job 'failed', which triggers
// sendWorker.on('failed'). Swallowing errors leaves campaigns stuck in 'sending'.

import type { Job } from 'bullmq';
import { sequelize, Campaign, CampaignRecipient } from '../db/index.js';
import { logger } from '../util/logger.js';

export interface SendJobData {
  campaignId: number;
  userId: number;
}

export async function processSendJob(job: Job<SendJobData>): Promise<void> {
  const { campaignId } = job.data;

  // QUEUE-03: stale delayed job guard — re-check status before any writes
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign || campaign.status !== 'sending') {
    logger.info(
      { campaignId, status: campaign?.status ?? 'not found' },
      'send job skipped — campaign not in sending state',
    );
    return; // not an error; bail cleanly
  }

  // QUEUE-02 + C9: single transaction — all or nothing
  await sequelize.transaction(async (t) => {
    const recipients = await CampaignRecipient.findAll({
      where: { campaignId, status: 'pending' },
      transaction: t,
    });

    logger.info({ campaignId, recipientCount: recipients.length }, 'processing send job');

    for (const r of recipients) {
      const isSent = Math.random() > 0.3; // ~70% sent, ~30% failed (C9 simulation)
      await r.update(
        {
          status: isSent ? ('sent' as const) : ('failed' as const),
          sentAt: isSent ? new Date() : null,
        },
        { transaction: t },
      );
    }

    await Campaign.update(
      { status: 'sent' },
      { where: { id: campaignId }, transaction: t },
    );
  });
  // No catch here — let errors propagate to BullMQ (C4)

  logger.info({ campaignId }, 'send job completed');
}
