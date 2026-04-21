// backend/src/app.ts
//
// Phase 3: buildApp() factory.
//
// Returns a fully-configured Express app WITHOUT calling .listen() — index.ts
// owns the lifecycle. This split is what makes Phase 7 Supertest testing
// trivial (tests do `supertest(buildApp())` — no port binding, no cleanup).
//
// Middleware order (locked — grep-checked by Plan 04 acceptance gate):
//   1. httpLogger        — pino-http; tags req.id on every request
//   2. express.json      — body parser with 100 KB limit (DoS floor)
//   3. cookieParser      — populates req.cookies — MUST precede /auth (P3-7)
//   4. /health           — lightweight readiness probe
//   5. /auth             — PUBLIC router (auth endpoints themselves)
//   6. /campaigns        — PROTECTED (router-level authenticate via C7)
//   7. /recipients       — PROTECTED (router-level authenticate via C7)
//   8. /track            — PUBLIC router (tracking pixel, never gated — C17)
//   9. errorHandler      — LAST — Express 4 tail-middleware contract

import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { httpLogger } from './util/httpLogger.js';
import { authRouter } from './routes/auth.js';
import { campaignsRouter } from './routes/campaigns.js';
import { recipientsRouter } from './routes/recipients.js';
import { trackRouter } from './routes/track.js';
import { errorHandler } from './middleware/errorHandler.js';

export function buildApp(): Express {
  const app = express();

  // 1. Request logger (tags req.id, logs method + url + status)
  app.use(httpLogger);

  // 2. JSON body parser with 100 KB limit (T-03-15 DoS floor)
  app.use(express.json({ limit: '100kb' }));

  // 3. Cookie parser — MUST be before /auth (P3-7)
  app.use(cookieParser());

  // 4. Health probe (no auth; tiny)
  app.get('/health', (_req, res) => {
    res.json({ data: { ok: true } });
  });

  // 5. Public: auth endpoints (/me inside has per-route authenticate)
  app.use('/auth', authRouter);

  // 6-7. Protected: campaigns + recipients (router-level authenticate)
  app.use('/campaigns', campaignsRouter);
  app.use('/recipients', recipientsRouter);

  // 8. Public: tracking pixel (no authenticate — C17 oracle defense, T-06-04)
  app.use('/track', trackRouter);  // PUBLIC — never inherits authenticate

  // 9. TAIL error handler (4-arg signature — Express 4 contract)
  app.use(errorHandler);

  return app;
}
