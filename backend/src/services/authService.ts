// backend/src/services/authService.ts
//
// Phase 3 (AUTH-01, AUTH-02 business logic):
//   - registerUser: bcrypt-hashes the password, creates the User row, maps
//     Sequelize unique-violation to ConflictError('EMAIL_ALREADY_REGISTERED')
//     so the HTTP layer gets a stable error code (vs relying on
//     errorHandler's generic UNIQUE_VIOLATION fallback).
//   - authenticateUser: looks up by email, runs bcrypt.compare, throws an
//     INVALID_CREDENTIALS unauthorized error on either missing user OR wrong
//     password. The missing-user branch runs a dummy bcrypt.compare against a
//     throwaway hash so response latency does not leak whether the email
//     exists (P3-4 — email enumeration defense).
//
// Imports:
//   - User from db/index.js (barrel — guarantees initModel + associate ran)
//   - bcryptjs (already in deps from Phase 2 seeder)
//   - config.BCRYPT_COST from Plan 01 (default 10; matches Phase 2 seeder)

import bcrypt from 'bcryptjs';
import { User } from '../db/index.js';
import { config } from '../config/env.js';
import { ConflictError, UnauthorizedError } from '../util/errors.js';

// A well-formed bcrypt hash at cost=10 so bcrypt.compare has realistic work to
// do when the user doesn't exist. The value itself never matches any real
// password. Cost must be numerically equal to the cost used for registered
// users — otherwise the dummy-compare timing differs from the real-compare
// timing, reintroducing the enumeration oracle.
const TIMING_DUMMY_HASH =
  '$2b$10$CwTycUXWue0Thq9StjUM0uJ8/0EeJ7qvdN1f3eKUj8eG8p6D6uGTe';

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<User> {
  try {
    const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_COST);
    const user = await User.create({
      email: input.email,
      passwordHash,
      name: input.name,
    });
    return user;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name: string }).name === 'SequelizeUniqueConstraintError'
    ) {
      throw new ConflictError('EMAIL_ALREADY_REGISTERED');
    }
    throw err;
  }
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<User> {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    // Timing-attack defense: equal-cost compare against a dummy hash so the
    // response time of the "no user" branch matches the "wrong password"
    // branch. Ignore the result.
    await bcrypt.compare(password, TIMING_DUMMY_HASH);
    throw new UnauthorizedError('INVALID_CREDENTIALS');
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new UnauthorizedError('INVALID_CREDENTIALS');
  }
  return user;
}
