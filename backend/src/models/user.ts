// backend/src/models/user.ts
import { DataTypes, Model, Sequelize, type Optional } from 'sequelize';

export interface UserAttributes {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
export type UserCreationAttributes = Optional<UserAttributes, 'id' | 'createdAt' | 'updatedAt'>;

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: number;
  declare email: string;
  declare passwordHash: string;
  declare name: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof User {
    User.init(
      {
        id:            { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        email:         { type: DataTypes.STRING(320), allowNull: false, unique: true },
        passwordHash:  { type: DataTypes.STRING(255), allowNull: false },
        name:          { type: DataTypes.STRING(200), allowNull: false },
        createdAt:     { type: DataTypes.DATE, allowNull: false },
        updatedAt:     { type: DataTypes.DATE, allowNull: false },
      },
      {
        sequelize, tableName: 'users', modelName: 'User',
        underscored: true, timestamps: true,
      },
    );
    return User;
  }

  static associate(models: { Campaign: typeof import('./campaign.js').Campaign }): void {
    User.hasMany(models.Campaign, { foreignKey: 'createdBy', as: 'campaigns' });
  }
}
