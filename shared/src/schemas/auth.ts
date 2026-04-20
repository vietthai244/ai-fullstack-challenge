import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;
