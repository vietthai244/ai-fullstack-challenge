'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('campaign_recipients', {
      campaign_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        primaryKey: true,           // Part of composite PK
        references: { model: 'campaigns', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',        // DELETE CASCADE — draft-campaign delete wipes junction rows (M1)
      },
      recipient_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        primaryKey: true,           // Second half of composite PK
        references: { model: 'recipients', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',        // Deleting a recipient wipes their junction rows
      },
      tracking_token: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),   // pgcrypto must be enabled — migration 00...pgcrypto runs first
      },
      status: {
        type: Sequelize.ENUM('pending', 'sent', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      sent_at:   { type: Sequelize.DATE, allowNull: true },
      opened_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    // Note: marking BOTH campaign_id AND recipient_id as primary-key columns above tells
    // Sequelize to emit them as the composite PK. No separate addConstraint('PRIMARY KEY') needed.
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('campaign_recipients');
    // Drop auto-created ENUM type (Pitfall 7)
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_campaign_recipients_status";',
    );
  },
};
