import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { runTick } from '../../jobs/tick.js';
import { AppError, unauthenticated } from '../../lib/errors.js';

// Constant-time comparison, so response timing doesn't reveal how much of a guess was right
function secretMatches(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// POST /api/internal/tick with "Authorization: Bearer <CRON_SECRET>"
export const tick: RequestHandler = async (req, res) => {
  if (!env.cronSecret) throw new AppError(404, 'ROUTE_NOT_FOUND', 'Not found');
  const provided = req.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!secretMatches(provided, env.cronSecret)) throw unauthenticated();

  res.status(200).json({ data: await runTick() });
};
