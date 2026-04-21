import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

// AUTH-02 — Login request body.
// Note: password min=1 (not min=8) intentionally — login must not leak the
// registration password policy. Register enforces the real policy.
export const LoginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof LoginSchema>;

// AUTH-05 — authenticated user shape (returned by /auth/login and /auth/me).
// BIGINT user.id is safe to serialize as JS number (users table is well
// below 2^53). Phase 4+ campaigns use BIGINT IDs as strings.
export const AuthUserSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().email(),
  name: z.string(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

// AUTH-02 — /auth/login response body.
export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: AuthUserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// AUTH-03 — /auth/refresh response body.
export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;
