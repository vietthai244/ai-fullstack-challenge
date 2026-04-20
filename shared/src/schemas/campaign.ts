import { z } from 'zod';

export const CampaignStatusEnum = z.enum(['draft', 'scheduled', 'sending', 'sent']);
export type CampaignStatus = z.infer<typeof CampaignStatusEnum>;
