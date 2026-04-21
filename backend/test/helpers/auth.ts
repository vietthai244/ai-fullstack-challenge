// backend/test/helpers/auth.ts
//
// Test helpers for user creation and JWT minting.
// Uses real signAccess() — no mock. Requires JWT_ACCESS_SECRET in env.
// Uses User.create() with a dummy hash — skips bcrypt entirely (tests don't exercise login).

import { signAccess } from '../../src/lib/tokens.js';
import { User } from '../../src/db/index.js';

export async function createTestUser(email: string, name = 'Test User'): Promise<User> {
  // Direct model insert — bypasses authService/bcrypt.
  // '$2b$04$...' is a syntactically valid bcrypt hash but not verifiable — intentional.
  // Tests use JWT middleware, not password auth.
  return User.create({
    email,
    passwordHash: '$2b$04$dummy.hash.not.verifiable.000000000000000000000000',
    name,
  });
}

export function makeToken(user: User): string {
  // signAccess accepts id: number | string — pg returns BIGINT as string from User.id
  return signAccess({ id: user.id, email: user.email });
}
