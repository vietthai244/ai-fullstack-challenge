'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface /* , Sequelize */) {
    // Covers cursor pagination + ownership filter in a single B-tree scan (C8, C16)
    // Used by CAMP-01 `GET /campaigns` in Phase 4
    await queryInterface.addIndex('campaigns', {
      name: 'idx_campaigns_created_by_created_at_id',
      fields: [
        'created_by',
        { name: 'created_at', order: 'DESC' },
        { name: 'id',         order: 'DESC' },
      ],
    });

    // Covers stats aggregation `COUNT(*) FILTER (WHERE status = 'sent') ... WHERE campaign_id = ?` (C1, C8)
    // Used by CAMP-08 `GET /campaigns/:id/stats` in Phase 4
    await queryInterface.addIndex('campaign_recipients', {
      name: 'idx_campaign_recipients_campaign_id_status',
      fields: ['campaign_id', 'status'],
    });

    // Intentionally NO explicit addIndex for:
    //   - campaign_recipients.tracking_token     (auto-indexed by inline UNIQUE → campaign_recipients_tracking_token_key)
    //   - users.email                            (auto-indexed by inline UNIQUE → users_email_key)
    //   - recipients.email                       (auto-indexed by inline UNIQUE → recipients_email_key)
    //   - campaign_recipients(campaign_id, recipient_id)   (composite PRIMARY KEY is an index by definition)
    // Adding explicit addIndex for any of these duplicates the auto-index and breaks removeIndex on down (Pitfall 9).
  },

  async down(queryInterface /* , Sequelize */) {
    await queryInterface.removeIndex('campaign_recipients', 'idx_campaign_recipients_campaign_id_status');
    await queryInterface.removeIndex('campaigns', 'idx_campaigns_created_by_created_at_id');
  },
};
