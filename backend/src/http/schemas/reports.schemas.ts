import { z } from 'zod';

export const trendsQuerySchema = z.object({
  months: z.coerce.number().int().min(2).max(36).default(12),
});

export const forecastQuerySchema = z.object({
  range: z.enum(['30d', '90d', '12m']).default('90d'),
});

export const exportQuerySchema = z.object({
  type: z.enum(['subscriptions', 'price-history']).default('subscriptions'),
});
