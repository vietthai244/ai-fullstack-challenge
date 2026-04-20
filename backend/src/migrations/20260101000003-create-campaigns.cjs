'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('campaigns', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
      name:    { type: Sequelize.STRING(255), allowNull: false },
      subject: { type: Sequelize.STRING(255), allowNull: false },
      body:    { type: Sequelize.TEXT,         allowNull: false },
      status: {
        type: Sequelize.ENUM('draft', 'scheduled', 'sending', 'sent'),
        allowNull: false,
        defaultValue: 'draft',
      },
      scheduled_at: { type: Sequelize.DATE, allowNull: true },
      created_by: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',     // user delete cleans up their campaigns (M1)
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('campaigns');
    // Drop the ENUM type Sequelize auto-created — otherwise re-up() fails with "type already exists" (Pitfall 7)
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_campaigns_status";');
  },
};
