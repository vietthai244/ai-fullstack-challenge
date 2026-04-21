// backend/src/db/config.cjs
// Loaded by sequelize-cli — must be CJS (backend is "type": "module")
require('dotenv').config(); // reads backend/.env if present

const base = {
  dialect: 'postgres',
  use_env_variable: 'DATABASE_URL',   // sequelize-cli special key — reads process.env.DATABASE_URL
  dialectOptions: {
    // Local dev / docker: no SSL. Production (hosted PG) may require { ssl: { require: true, rejectUnauthorized: false } }
    ssl: false,
  },
  define: {
    underscored: true,
    timestamps: true,
  },
};

module.exports = {
  development: {
    ...base,
    logging: console.log,           // CLI output for dev
  },
  test: {
    ...base,
    use_env_variable: 'DATABASE_URL_TEST',  // separate test DB — Phase 7 will populate
    logging: false,
  },
  production: {
    ...base,
    logging: false,
  },
};
