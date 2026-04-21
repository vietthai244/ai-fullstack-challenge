import { z } from 'zod';

// D-26 — Recipient schemas

// RECIP-01 — POST /recipients upsert request body
export const CreateRecipientSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(200).optional(),
});
export type CreateRecipientInput = z.infer<typeof CreateRecipientSchema>;

// D-26 — Recipient response shape (BIGINT id as string — confirmed Phase 3)
export const RecipientSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Recipient = z.infer<typeof RecipientSchema>;
