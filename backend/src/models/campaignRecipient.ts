// backend/src/models/campaignRecipient.ts
import { DataTypes, Model, Sequelize, type Optional } from 'sequelize';

export type RecipientStatus = 'pending' | 'sent' | 'failed';

export interface CampaignRecipientAttributes {
  campaignId: number;
  recipientId: number;
  trackingToken: string;
  status: RecipientStatus;
  sentAt: Date | null;
  openedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export type CampaignRecipientCreationAttributes = Optional<
  CampaignRecipientAttributes,
  'trackingToken' | 'status' | 'sentAt' | 'openedAt' | 'createdAt' | 'updatedAt'
>;

export class CampaignRecipient
  extends Model<CampaignRecipientAttributes, CampaignRecipientCreationAttributes>
  implements CampaignRecipientAttributes {
  declare campaignId: number;
  declare recipientId: number;
  declare trackingToken: string;
  declare status: RecipientStatus;
  declare sentAt: Date | null;
  declare openedAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof CampaignRecipient {
    CampaignRecipient.init(
      {
        campaignId:    { type: DataTypes.BIGINT, allowNull: false, primaryKey: true },
        recipientId:   { type: DataTypes.BIGINT, allowNull: false, primaryKey: true },
        trackingToken: {
          type: DataTypes.UUID,
          allowNull: false,
          unique: true,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
        },
        status: {
          type: DataTypes.ENUM('pending', 'sent', 'failed'),
          allowNull: false,
          defaultValue: 'pending',
        },
        sentAt:    { type: DataTypes.DATE, allowNull: true },
        openedAt:  { type: DataTypes.DATE, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      },
      {
        sequelize, tableName: 'campaign_recipients', modelName: 'CampaignRecipient',
        underscored: true, timestamps: true,
      },
    );
    return CampaignRecipient;
  }

  static associate(models: {
    Campaign: typeof import('./campaign.js').Campaign;
    Recipient: typeof import('./recipient.js').Recipient;
  }): void {
    CampaignRecipient.belongsTo(models.Campaign, { foreignKey: 'campaignId', as: 'campaign' });
    CampaignRecipient.belongsTo(models.Recipient, { foreignKey: 'recipientId', as: 'recipient' });
  }
}
