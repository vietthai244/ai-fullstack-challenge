// backend/src/routes/auth.ts
//
// Phase 3: /auth/* HTTP surface.
//
// Owned by this router (all in this one file):
//   POST /register   AUTH-01
//   POST /login      AUTH-02
//   POST /refresh    AUTH-03
//   POST /logout     AUTH-04
//   GET  /me         AUTH-05
//
// Invariants (see RESEARCH.md §Refresh Token Design + §Code Examples):
//   1. Thin handlers. All business logic lives in authService (bcrypt + User)
//      and lib/tokens (JWT sign/verify). This file maps HTTP shapes to
//      service calls and back (+ cookie + denylist + CSRF where applicable).
//   2. `{ data: ... }` envelope on success. Errors forwarded via next(err)
//      for the tail errorHandler (Plan 01) to shape as `{ error: { code, message } }`.
//   3. Single module-scope COOKIE_OPTS — every res.cookie / res.clearCookie
//      spreads from it so Path/HttpOnly/SameSite match on both ends.
//   4. Path='/auth/refresh' — cookie is scoped to the refresh endpoint only.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { RegisterSchema, LoginSchema } from '@campaign/shared';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import * as authService from '../services/authService.js';
import {
  signAccess,
  signRefresh,
  verifyRefresh,
} from '../lib/tokens.js';
import { redis } from '../lib/redis.js';
import { UnauthorizedError } from '../util/errors.js';
import { config } from '../config/env.js';
import { User } from '../db/index.js';
import jwt from 'jsonwebtoken';

export const authRouter: Router = Router();

// Cookie options — SINGLE SOURCE OF TRUTH. Spread from here on every set and
// clear so Path/HttpOnly/SameSite/Secure stay in sync (Pitfall P3-1).
const COOKIE_OPTS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/auth/refresh',
  maxAge: 7 * 24 * 60 * 60 * 1000,       // 7 days in ms
};

// ---------------------------------------------------------------------------
// AUTH-01 · POST /auth/register
// ---------------------------------------------------------------------------
authRouter.post(
  '/register',
  validate(RegisterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.registerUser(req.body);
      res.status(201).json({
        data: { id: user.id, email: user.email, name: user.name },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// AUTH-02 · POST /auth/login
// Returns { accessToken, user }. Sets refresh cookie.
// ---------------------------------------------------------------------------
authRouter.post(
  '/login',
  validate(LoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.authenticateUser(
        req.body.email,
        req.body.password,
      );
      const accessToken = signAccess(user);
      const { token: refreshToken } = signRefresh(user);
      res.cookie('rt', refreshToken, COOKIE_OPTS);
      res.json({
        data: {
          accessToken,
          user: { id: user.id, email: user.email, name: user.name },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// AUTH-03 · POST /auth/refresh
// Rotation-on-refresh with Redis denylist. CSRF check via X-Requested-With.
// ---------------------------------------------------------------------------
authRouter.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Defense-in-depth CSRF (A7): any cross-origin form POST cannot set
      // custom headers; a legit fetch/axios client sets this header.
      if (req.headers['x-requested-with'] !== 'fetch') {
        throw new UnauthorizedError('CSRF_CHECK_FAILED');
      }
      const rt = req.cookies?.rt as string | undefined;
      if (!rt) {
        throw new UnauthorizedError('MISSING_REFRESH_TOKEN');
      }

      // 1. Signature + expiry verified (verifyRefresh uses algorithms:['HS256']).
      const decoded = verifyRefresh(rt);

      // 2. Denylist check — if already denylisted, treat as a replay signal:
      //    clear the cookie so the attacker's copy ALSO becomes unusable on
      //    the next request, and 401.
      const denied = await redis.exists(`jwt:denylist:${decoded.jti}`);
      if (denied) {
        res.clearCookie('rt', { ...COOKIE_OPTS, maxAge: undefined });
        throw new UnauthorizedError('TOKEN_REVOKED');
      }

      // 3. Rotation: denylist the OLD jti with TTL = remaining life.
      //    Guard against zero/negative TTL (token on the edge of expiry).
      //    If Redis fails here, clear cookie and 401 — safer than silently
      //    skipping the denylist and issuing a new token (WR-01).
      const secondsRemaining = Math.max(
        0,
        decoded.exp - Math.floor(Date.now() / 1000),
      );
      if (secondsRemaining > 0) {
        try {
          await redis.set(
            `jwt:denylist:${decoded.jti}`,
            '1',
            'EX',
            secondsRemaining,
          );
        } catch {
          res.clearCookie('rt', { ...COOKIE_OPTS, maxAge: undefined });
          throw new UnauthorizedError('REFRESH_UNAVAILABLE');
        }
      }

      // 4. Re-verify user still exists (handles edge case where account was
      //    deleted between login and refresh — T-03-13).
      //    Cast sub to number — JWT sub is always a string; findByPk with a
      //    string relies on implicit DB coercion (not guaranteed).
      const userId = Number(decoded.sub);
      if (!Number.isFinite(userId) || userId <= 0) {
        throw new UnauthorizedError('INVALID_TOKEN_SUB');
      }
      const user = await User.findByPk(userId);
      if (!user) {
        throw new UnauthorizedError('USER_NOT_FOUND');
      }

      // 5. Mint new pair + set new cookie.
      const accessToken = signAccess(user);
      const { token: newRt } = signRefresh(user);
      res.cookie('rt', newRt, COOKIE_OPTS);
      res.json({ data: { accessToken } });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// AUTH-04 · POST /auth/logout
// Clears the refresh cookie. Denylist attempted if cookie is present on request
// (cookie path is /auth/refresh so browser only sends it when calling that endpoint).
// ---------------------------------------------------------------------------
authRouter.post(
  '/logout',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rt = req.cookies?.rt as string | undefined;
      if (rt) {
        try {
          // Verify signature (ignoreExpiration: true so expired-but-valid
          // tokens are still denylisted). Using jwt.decode here would allow
          // an attacker to inject arbitrary Redis keys via a crafted jti.
          const decoded = jwt.verify(rt, config.JWT_REFRESH_SECRET, {
            algorithms: ['HS256'],
            ignoreExpiration: true,
          }) as { jti?: string; exp?: number };
          if (decoded?.jti && decoded.exp) {
            const secondsRemaining = Math.max(
              0,
              decoded.exp - Math.floor(Date.now() / 1000),
            );
            if (secondsRemaining > 0) {
              await redis.set(
                `jwt:denylist:${decoded.jti}`,
                '1',
                'EX',
                secondsRemaining,
              );
            }
          }
        } catch {
          // Invalid token — nothing to denylist; clear cookie and succeed.
        }
      }
      // Clear-cookie MUST spread COOKIE_OPTS so Path/HttpOnly/SameSite match
      // the original Set-Cookie. Otherwise the browser no-ops (Pitfall P3-1).
      res.clearCookie('rt', { ...COOKIE_OPTS, maxAge: undefined });
      res.json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// AUTH-05 · GET /auth/me
// Per-route `authenticate` (the rest of the auth router is PUBLIC — only /me
// requires a bearer token). Fresh DB lookup on every call; never trust the
// embedded email claim alone in case the user was edited since token mint.
// ---------------------------------------------------------------------------
authRouter.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await User.findByPk(req.user!.id);
      if (!user) {
        throw new UnauthorizedError('USER_NOT_FOUND');
      }
      res.json({
        data: { id: user.id, email: user.email, name: user.name },
      });
    } catch (err) {
      next(err);
    }
  },
);
