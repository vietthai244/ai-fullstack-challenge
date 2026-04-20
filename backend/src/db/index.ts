// backend/src/db/index.ts
import 'dotenv/config';
import { Sequelize } from 'sequelize';
import { logger } from '../util/logger.js';
import { User } from '../models/user.js';
import { Recipient } from '../models/recipient.js';
import { Campaign } from '../models/campaign.js';
import { CampaignRecipient } from '../models/campaignRecipient.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — see .env.example');
}

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const isTest = process.env.NODE_ENV === 'test';

export const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  define: { underscored: true, timestamps: true },
  logging: isTest
    ? false
    : isDev
      ? (sql: string) => logger.debug({ sql }, 'sequelize')
      : false,
});

// Init all models first (order irrelevant — Sequelize doesn't validate FKs until associate).
User.initModel(sequelize);
Recipient.initModel(sequelize);
Campaign.initModel(sequelize);
CampaignRecipient.initModel(sequelize);

// Associate: every model gets the full models registry so it can reference siblings.
const models = { User, Recipient, Campaign, CampaignRecipient };
User.associate(models);
Recipient.associate(models);
Campaign.associate(models);
CampaignRecipient.associate(models);

export { User, Recipient, Campaign, CampaignRecipient };
