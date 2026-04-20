'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      email: {
        type: Sequelize.STRING(320),
        allowNull: false,
        unique: true,          // creates a UNIQUE constraint inline (Postgres auto-indexes unique constraints)
      },
      password_hash: {
        type: Sequelize.STRING(255),     // bcryptjs 2b hashes are 60 chars; 255 is safe for future algo migration
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface /* , Sequelize */) {
    await queryInterface.dropTable('users');
  },
};
