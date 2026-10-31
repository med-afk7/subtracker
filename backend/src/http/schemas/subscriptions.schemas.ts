import { z } from 'zod';
import { isValidCurrency } from '../../domain/money.js';
import { isPlainDate } from '../../domain/plainDate.js';

// Control characters (newlines, tabs, bells...) have no place in a name or label, and would end up
// in email subject lines, CSV files and logs. Multi-line notes may keep line breaks.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex -- as above, but allowing \n and \r
const CONTROL_CHARS_EXCEPT_NEWLINES = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/;
const noControlChars = (pattern: RegExp) => (value: string | null | undefined) =>
  !value || !pattern.test(value);
const CONTROL_CHAR_MESSAGE = 'Contains characters that aren’t allowed';

// Optional text from forms: '' means "clear it" (null); undefined means "leave it unchanged"
const optionalText = (max: number, label: string, multiline = false) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .string()
      .trim()
      .max(max, `${label} is at most ${max} characters`)
      .refine(noControlChars(multiline ? CONTROL_CHARS_EXCEPT_NEWLINES : CONTROL_CHARS), {
        message: CONTROL_CHAR_MESSAGE,
      })
      .nullable()
      .optional(),
  );

const optionalUrl = (label: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .url({ protocol: /^https?$/, message: `${label} must be an http(s) link` })
      .max(500)
      .nullable()
      .optional(),
  );

export const plainDateSchema = z
  .string()
  .refine(isPlainDate, { message: 'Must be a real date in YYYY-MM-DD format' });

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isValidCurrency, { message: 'Unknown currency code (use ISO 4217, e.g. USD)' });

// Converted to minor units by the service, once the currency is known
const amountSchema = z.string({ message: 'Amount must be a string like "9.99"' }).trim().max(20);

const MAX_INTERVAL_COUNT = { week: 52, month: 24, year: 10 } as const;

// Labels only: catch anyone typing a full card number into the field
const paymentLabel = optionalText(50, 'Payment method label').refine(
  (value) => !value || !/\d{12,}/.test(value.replace(/[\s-]/g, '')),
  { message: 'Don’t enter card numbers. A label like “Visa ending 1234” is enough.' },
);

const fields = {
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name is at most 100 characters')
    .refine(noControlChars(CONTROL_CHARS), { message: CONTROL_CHAR_MESSAGE }),
  // A preset's slug (e.g. "netflix"); the catalog itself lives in the frontend
  service: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'Invalid service')
    .nullable(),
  category: z.string().trim().min(1).max(50),
  notes: optionalText(1000, 'Notes', true),
  amount: amountSchema,
  currency: currencySchema,
  billingInterval: z.enum(['week', 'month', 'year'], {
    message: 'Billing interval must be week, month or year',
  }),
  billingIntervalCount: z.number().int().min(1, 'Must be at least 1'),
  startDate: plainDateSchema,
  nextBillingDate: plainDateSchema,
  endDate: plainDateSchema.nullable(),
  reminderMode: z.enum(['default', 'custom', 'off']),
  reminderDaysBefore: z.number().int().min(0).max(30, 'At most 30 days').nullable(),
  paymentMethodLabel: paymentLabel,
  providerWebsite: optionalUrl('Website'),
  cancellationUrl: optionalUrl('Cancellation link'),
};

// Checks that only need the request itself; checks against stored data live in the service
function checkFields(
  value: Partial<{
    billingInterval: keyof typeof MAX_INTERVAL_COUNT;
    billingIntervalCount: number;
    startDate: string;
    nextBillingDate: string;
    endDate: string | null;
    reminderMode: string;
    reminderDaysBefore: number | null;
  }>,
  ctx: z.RefinementCtx,
) {
  const { billingInterval, billingIntervalCount, startDate, nextBillingDate, endDate } = value;
  if (
    billingInterval &&
    billingIntervalCount &&
    billingIntervalCount > MAX_INTERVAL_COUNT[billingInterval]
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['billingIntervalCount'],
      message: `At most ${MAX_INTERVAL_COUNT[billingInterval]} ${billingInterval}s`,
    });
  }
  if (startDate && nextBillingDate && nextBillingDate < startDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['nextBillingDate'],
      message: 'Can’t be before the start date',
    });
  }
  if (startDate && endDate && endDate < startDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Can’t be before the start date' });
  }
  if (value.reminderMode === 'custom' && value.reminderDaysBefore == null) {
    ctx.addIssue({
      code: 'custom',
      path: ['reminderDaysBefore'],
      message: 'Choose how many days before',
    });
  }
}

export const createSubscriptionSchema = z
  .object({
    ...fields,
    category: fields.category.default('other'),
    service: fields.service.optional(),
    billingIntervalCount: fields.billingIntervalCount.default(1),
    // The first billing date on or after the start. Defaults to the start date.
    nextBillingDate: fields.nextBillingDate.optional(),
    endDate: fields.endDate.optional(),
    reminderMode: fields.reminderMode.default('default'),
    reminderDaysBefore: fields.reminderDaysBefore.optional(),
  })
  .superRefine(checkFields);

// PATCH: every field optional. nextBillingDate re-anchors the schedule; priceEffectiveDate says
// when a price change took effect (defaults to today).
export const updateSubscriptionSchema = z
  .object({
    ...Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()])),
    priceEffectiveDate: plainDateSchema.optional(),
  } as { [K in keyof typeof fields]: z.ZodOptional<(typeof fields)[K]> } & {
    priceEffectiveDate: z.ZodOptional<typeof plainDateSchema>;
  })
  .superRefine(checkFields);

export const cancelSchema = z.object({ endDate: plainDateSchema.nullable().optional() });
export const reactivateSchema = z.object({ nextBillingDate: plainDateSchema });

export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  // Omitted: active and cancelled (archived subscriptions are hidden by default)
  state: z.enum(['active', 'cancelled', 'archived']).optional(),
  interval: z.enum(['week', 'month', 'year']).optional(),
  sort: z.enum(['nextBillingDate', 'amount', 'name']).default('nextBillingDate'),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100, 'At most 100 per page').default(20),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
