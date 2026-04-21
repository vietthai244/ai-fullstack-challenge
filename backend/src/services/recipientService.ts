// backend/src/services/recipientService.ts
//
// Phase 4 (RECIP-01, RECIP-02 business logic):
//   - upsertRecipient: INSERT ON CONFLICT (user_id, email) DO UPDATE SET name = COALESCE(EXCLUDED.name, recipients.name)
//     D-14: only overwrites name when explicitly provided — preserves existing name when name=null
//   - listRecipients: cursor-paginated list (D-16r..D-21r)
//     Cursor format: base64url(JSON.stringify({ cAt: ISO string, cId: id string }))
//     Query: Sequelize.literal('(created_at, id) < (:cAt, :cId)') with replacements — C16 compliance
//     Ownership filter via userId (never from cursor payload — D-18r)

import { QueryTypes, Sequelize, Op } from 'sequelize';
import { sequelize, Recipient } from '../db/index.js';
import { BadRequestError } from '../util/errors.js';
import type { CreateRecipientInput } from '@campaign/shared';

// ---------------------------------------------------------------------------
// Cursor helpers (D-16r: opaque base64url JSON payload)
// ---------------------------------------------------------------------------
interface CursorPayload {
  cAt: string;
  cId: string;
}

function encodeCursor(createdAt: Date, id: number | string): string {
  return Buffer.from(
    JSON.stringify({ cAt: new Date(createdAt).toISOString(), cId: String(id) }),
  ).toString('base64url');
}

function decodeCursor(cursor: string): CursorPayload {
  let payload: CursorPayload;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;
  } catch {
    throw new BadRequestError('INVALID_CURSOR');
  }
  // All three guards required — D-20r
  if (!payload.cAt || !payload.cId) throw new BadRequestError('INVALID_CURSOR');
  const d = new Date(payload.cAt);
  if (isNaN(d.getTime())) throw new BadRequestError('INVALID_CURSOR'); // C16: validates timestamp
  if (isNaN(Number(payload.cId))) throw new BadRequestError('INVALID_CURSOR');
  return payload;
}

// ---------------------------------------------------------------------------
// upsertRecipient — D-14: COALESCE preserves existing name when not explicitly provided
// POST /recipients
// ---------------------------------------------------------------------------
export async function upsertRecipient(
  userId: number,
  input: CreateRecipientInput,
): Promise<Record<string, unknown>> {
  const rows = await sequelize.query<{
    id: string;
    email: string;
    name: string | null;
    userId: string;
    createdAt: string;
    updatedAt: string;
  }>(
    `INSERT INTO recipients (user_id, email, name, created_at, updated_at)
     VALUES (:userId, :email, :name, NOW(), NOW())
     ON CONFLICT (user_id, email)
       DO UPDATE SET name = COALESCE(EXCLUDED.name, recipients.name),
                     updated_at = NOW()
     RETURNING id, email, name, user_id AS "userId", created_at AS "createdAt", updated_at AS "updatedAt"`,
    {
      replacements: { userId, email: input.email, name: input.name ?? null },
      type: QueryTypes.SELECT,
    },
  );

  return rows[0] as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// listRecipients — cursor pagination (D-16r..D-21r, C16)
// GET /recipients?limit=20&cursor=<opaque>
// Returns { data, nextCursor, hasMore } — explicit null on last page (m5)
// ---------------------------------------------------------------------------
export async function listRecipients(
  userId: number,
  limit: number,
  cursor?: string,
): Promise<{ data: Recipient[]; nextCursor: string | null; hasMore: boolean }> {
  let cursorPayload: CursorPayload | null = null;
  if (cursor) {
    cursorPayload = decodeCursor(cursor); // throws BadRequestError on malformed input (D-20r)
  }

  const results = await Recipient.findAll({
    where: cursorPayload
      ? {
          userId,
          [Op.and]: [Sequelize.literal('(created_at, id) < (:cAt, :cId)')],
        }
      : { userId },
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: limit + 1, // fetch one extra to detect hasMore
    replacements: cursorPayload
      ? { cAt: cursorPayload.cAt, cId: Number(cursorPayload.cId) }
      : {},
  });

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;

  // m5: explicit null, never undefined, on last page
  const lastItem = data.length > 0 ? data[data.length - 1] : null;
  const nextCursor =
    hasMore && lastItem != null
      ? encodeCursor(lastItem.createdAt, lastItem.id)
      : null;

  return { data, nextCursor, hasMore };
}
