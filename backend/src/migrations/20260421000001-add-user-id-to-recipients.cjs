'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add user_id as NULLABLE first — cannot add NOT NULL without backfilling
    await queryInterface.addColumn('recipients', 'user_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // 2. Backfill: assign existing seed rows to the first/demo user
    await queryInterface.sequelize.query(
      'UPDATE recipients SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL'
    );

    // 3. Enforce NOT NULL now that all rows have a value
    await queryInterface.changeColumn('recipients', 'user_id', {
      type: Sequelize.BIGINT,
      allowNull: false,
    });

    // 4. Drop old global UNIQUE(email) — constraint name verified: recipients_email_key
    await queryInterface.removeConstraint('recipients', 'recipients_email_key');

    // 5. Add composite UNIQUE(user_id, email) — per-user uniqueness (D-01)
    await queryInterface.addConstraint('recipients', {
      fields: ['user_id', 'email'],
      type: 'unique',
      name: 'recipients_user_id_email_key',
    });

    // 6. Add index on recipients(user_id) for list queries (D-02)
    await queryInterface.addIndex('recipients', {
      fields: ['user_id'],
      name: 'idx_recipients_user_id',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('recipients', 'idx_recipients_user_id');
    await queryInterface.removeConstraint('recipients', 'recipients_user_id_email_key');
    await queryInterface.addConstraint('recipients', {
      fields: ['email'],
      type: 'unique',
      name: 'recipients_email_key',
    });
    await queryInterface.removeColumn('recipients', 'user_id');
  },
};
