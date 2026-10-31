import { z } from 'zod';
import { daysBetween, isPlainDate } from '../../domain/plainDate.js';
import { plainDateSchema } from './subscriptions.schemas.js';

const MAX_RANGE_DAYS = 366;

export const calendarQuerySchema = z
  .object({
    from: plainDateSchema,
    to: plainDateSchema,
    subscriptionId: z.uuid({ message: 'Invalid subscription id' }).optional(),
    category: z.string().trim().max(50).optional(),
  })
  .superRefine(({ from, to }, ctx) => {
    // Zod still runs this when a date already failed its own check; don't do date math on it
    if (!isPlainDate(from) || !isPlainDate(to)) return;
    if (to < from) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'Must be on or after "from"' });
    } else if (daysBetween(from, to) > MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `At most ${MAX_RANGE_DAYS} days per request`,
      });
    }
  });

export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
