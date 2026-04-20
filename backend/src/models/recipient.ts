// backend/src/models/recipient.ts
import { DataTypes, Model, Sequelize, type Optional } from 'sequelize';

export interface RecipientAttributes {
  id: number;
  email: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export type RecipientCreationAttributes = Optional<
  RecipientAttributes, 'id' | 'createdAt' | 'updatedAt' | 'name'
>;

export class Recipient
  extends Model<RecipientAttributes, RecipientCreationAttributes>
  implements RecipientAttributes {
  declare id: number;
  declare email: string;
  declare name: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof Recipient {
    Recipient.init(
      {
        id:        { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        email:     { type: DataTypes.STRING(320), allowNull: false, unique: true },
        name:      { type: DataTypes.STRING(200), allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      },
      {
        sequelize, tableName: 'recipients', modelName: 'Recipient',
        underscored: true, timestamps: true,
      },
    );
    return Recipient;
  }

  static associate(models: {
    Campaign: typeof import('./campaign.js').Campaign;
    CampaignRecipient: typeof import('./campaignRecipient.js').CampaignRecipient;
  }): void {
    Recipient.belongsToMany(models.Campaign, {
      through: models.CampaignRecipient,
      foreignKey: 'recipientId',
      otherKey: 'campaignId',
      as: 'campaigns',
    });
    Recipient.hasMany(models.CampaignRecipient, { foreignKey: 'recipientId', as: 'campaignRecipients' });
  }
}
