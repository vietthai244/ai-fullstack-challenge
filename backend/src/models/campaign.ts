// backend/src/models/campaign.ts
import { DataTypes, Model, Sequelize, type Optional } from 'sequelize';
import type { CampaignStatus } from '@campaign/shared';

export interface CampaignAttributes {
  id: number;                     // BIGSERIAL — DataTypes.BIGINT + autoIncrement: true
  name: string;
  subject: string;
  body: string;
  status: CampaignStatus;         // 'draft' | 'scheduled' | 'sending' | 'sent' — from @campaign/shared
  scheduledAt: Date | null;       // TIMESTAMPTZ, nullable
  createdBy: number;              // BIGINT FK → users.id
  createdAt: Date;
  updatedAt: Date;
}

export type CampaignCreationAttributes = Optional<
  CampaignAttributes,
  'id' | 'createdAt' | 'updatedAt' | 'scheduledAt' | 'status'
>;

export class Campaign
  extends Model<CampaignAttributes, CampaignCreationAttributes>
  implements CampaignAttributes {
  declare id: number;
  declare name: string;
  declare subject: string;
  declare body: string;
  declare status: CampaignStatus;
  declare scheduledAt: Date | null;
  declare createdBy: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof Campaign {
    Campaign.init(
      {
        id: {
          type: DataTypes.BIGINT,
          autoIncrement: true,
          primaryKey: true,
        },
        name:    { type: DataTypes.STRING(255), allowNull: false },
        subject: { type: DataTypes.STRING(255), allowNull: false },
        body:    { type: DataTypes.TEXT,         allowNull: false },
        status: {
          type: DataTypes.ENUM('draft', 'scheduled', 'sending', 'sent'),
          allowNull: false,
          defaultValue: 'draft',
        },
        scheduledAt: { type: DataTypes.DATE,     allowNull: true },
        createdBy:   { type: DataTypes.BIGINT,   allowNull: false },
        createdAt:   { type: DataTypes.DATE,     allowNull: false },
        updatedAt:   { type: DataTypes.DATE,     allowNull: false },
      },
      {
        sequelize,
        tableName: 'campaigns',
        modelName: 'Campaign',
        underscored: true,
        timestamps: true,
      },
    );
    return Campaign;
  }

  static associate(models: {
    User: typeof import('./user.js').User;
    Recipient: typeof import('./recipient.js').Recipient;
    CampaignRecipient: typeof import('./campaignRecipient.js').CampaignRecipient;
  }): void {
    Campaign.belongsTo(models.User, {
      foreignKey: 'createdBy',    // TS attr; underscored: true renders as 'created_by' in SQL
      as: 'creator',
      onDelete: 'CASCADE',        // If a user is deleted, their campaigns go too (aligns with single-user scope)
    });
    Campaign.belongsToMany(models.Recipient, {
      through: models.CampaignRecipient,   // NAMED MODEL — not a string (STACK.md + PITFALLS M1 companion)
      foreignKey: 'campaignId',
      otherKey: 'recipientId',
      as: 'recipients',
    });
    Campaign.hasMany(models.CampaignRecipient, {
      foreignKey: 'campaignId',
      as: 'campaignRecipients',
      onDelete: 'CASCADE',
    });
  }
}
