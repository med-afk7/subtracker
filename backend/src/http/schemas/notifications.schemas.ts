import { z } from 'zod';

export const preferencesSchema = z
  .object({
    remindersEnabled: z.boolean(),
    defaultReminderDaysBefore: z.number().int().min(0).max(30, 'At most 30 days'),
  })
  .partial();

export const deliveriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
