// backend/src/routes/track.ts
//
// Public open-tracking pixel endpoint.
// NEVER returns non-200. DB errors are swallowed (oracle-attack defense — C17).
// trackRouter is mounted at the app level in app.ts, OUTSIDE the protected
// router group, so authenticate middleware is never inherited.

import { Router } from 'express';
import { Op } from 'sequelize';
import { CampaignRecipient } from '../models/campaignRecipient.js';

// Module-scoped — allocated once at load time, reused on every request.
// Correct 43-byte 1x1 transparent GIF89a (verified: node -e "console.log(Buffer.from('...','hex').length)")
// DO NOT use the ARCHITECTURE.md hex — it is 44 bytes (one extra 01 at offset 11).
const PIXEL = Buffer.from(
  '47494638396101000100800000ffffff00000021f9040100000000' +
  '2c00000000010001000002024c01003b',
  'hex'
);
// Invariant: PIXEL.length === 43

export const trackRouter: Router = Router();

trackRouter.get('/open/:trackingToken', async (req, res) => {
  try {
    await CampaignRecipient.update(
      { openedAt: new Date() },
      {
        where: {
          trackingToken: req.params.trackingToken,
          openedAt: { [Op.is]: null as any },
        },
      }
    );
  } catch {
    // Intentionally swallowed — oracle defense.
    // Caller must never know whether token matched, DB was reachable, etc.
    // DO NOT call next(err) here — errorHandler would change Content-Type + status.
  }
  res.set({
    'Content-Type':    'image/gif',
    'Content-Length':  String(PIXEL.length),
    'Cache-Control':   'no-store, no-cache, must-revalidate, private',
    'Pragma':          'no-cache',
    'Referrer-Policy': 'no-referrer',
  });
  res.status(200).end(PIXEL);
});
