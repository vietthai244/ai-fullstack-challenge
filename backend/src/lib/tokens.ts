// backend/src/lib/tokens.ts
//
// Phase 3: JWT sign/verify primitives.
//
// Invariants enforced here (all grep-checked by Plan 03/04 acceptance gates):
//   1. Singular-form algorithm option on every sign call (not the array form).
//   2. Plural-form algorithms array on every verify call — required by
//      jsonwebtoken to prevent CVE-2015-9235-class attacks (alg:none bypass).
//   3. Access and refresh signed with SEPARATE secrets (config.JWT_ACCESS_SECRET
//      vs config.JWT_REFRESH_SECRET — inequality enforced at boot by env.ts).
//   4. `type` claim distinguishes access ('access') from refresh ('refresh').
//      `verifyAccess` rejects refresh tokens; `verifyRefresh` rejects access
//      tokens. Belt-and-suspenders on top of secret separation.
//   5. `sub` is the user id as a string — JWT RFC 7519 §4.1.2 says `sub` is a
//      StringOrURI. Stringify at sign; Number() at the authenticate
//      middleware boundary ONCE (P3-3).
//   6. Refresh tokens carry a `jti` (UUIDv4 via node:crypto) — used as the
//      Redis denylist key in /auth/refresh and /auth/logout.

import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { UnauthorizedError } from '../util/errors.js';

export interface AccessPayload {
  sub: string;
  email: string;
  type: 'access';
}

export interface RefreshPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

export function signAccess(user: { id: number | string; email: string }): string {
  const payload: AccessPayload = {
    sub: String(user.id),
    email: user.email,
    type: 'access',
  };
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: config.ACCESS_TOKEN_TTL,
  } as jwt.SignOptions);
}

export function verifyAccess(token: string): AccessPayload & { iat: number; exp: number } {
  const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],
  }) as AccessPayload & { iat: number; exp: number };
  if (decoded.type !== 'access') {
    throw new UnauthorizedError('INVALID_TOKEN_TYPE');
  }
  return decoded;
}

export function signRefresh(user: { id: number | string }): {
  token: string;
  jti: string;
  exp: number;
} {
  const jti = randomUUID();
  const token = jwt.sign(
    { sub: String(user.id), jti, type: 'refresh' } satisfies RefreshPayload,
    config.JWT_REFRESH_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: config.REFRESH_TOKEN_TTL,
    } as jwt.SignOptions,
  );
  // Decode (no HMAC) to extract exp — token was just signed, no need to
  // re-verify. Using jwt.verify here was wasteful and semantically wrong
  // (verify is for untrusted input). Guard exp presence in case
  // REFRESH_TOKEN_TTL is misconfigured. (WR-03)
  const decoded = jwt.decode(token) as { exp?: number } | null;
  if (!decoded?.exp) {
    throw new Error('signRefresh: token missing exp — check REFRESH_TOKEN_TTL config');
  }
  return { token, jti, exp: decoded.exp };
}

export function verifyRefresh(
  token: string,
): RefreshPayload & { iat: number; exp: number } {
  const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET, {
    algorithms: ['HS256'],
  }) as RefreshPayload & { iat: number; exp: number };
  if (decoded.type !== 'refresh') {
    throw new UnauthorizedError('INVALID_TOKEN_TYPE');
  }
  return decoded;
}
