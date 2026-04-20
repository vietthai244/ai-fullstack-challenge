'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface /* , Sequelize */) {
    await queryInterface.sequelize.query(
      'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
    );
  },

  async down(/* queryInterface */) {
    // Intentional no-op: pgcrypto may be shared with other tooling on this DB.
    // Safe to leave — `CREATE EXTENSION IF NOT EXISTS` is idempotent on re-up.
  },
};
