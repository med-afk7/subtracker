import type { RequestHandler, Response } from 'express';
import { z } from 'zod';
import { formatAmount } from '../../domain/money.js';
import { describeFrequency } from '../../domain/recurrence.js';
import { todayIn } from '../../domain/plainDate.js';
import { UTF8_BOM, csvRow, neutralizeFormula } from '../../lib/csv.js';
import * as subscriptionsService from '../../services/subscriptions.service.js';
import { currentAuth } from '../middleware/requireAuth.js';

const exportQuerySchema = z.object({
  type: z.enum(['subscriptions', 'price-history']).default('subscriptions'),
});

// The file is written straight to the response: no temporary files that could leak
function startCsv(res: Response, filename: string) {
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // Personal data: don't let browsers or proxies keep a copy
  res.setHeader('Cache-Control', 'no-store');
  res.write(UTF8_BOM);
}

// GET /api/subscriptions/export?type=subscriptions|price-history
// Only the requester's own data; no internal ids, tokens or anything secret.
export const exportCsv: RequestHandler = async (req, res) => {
  const { type } = exportQuerySchema.parse(req.query);
  const auth = currentAuth(req);
  const ctx = { userId: auth.userId, timezone: auth.timezone };
  const date = todayIn(ctx.timezone);
  // User-entered text is neutralized so a spreadsheet won't run it as a formula
  const text = (value: string | null) => (value === null ? null : neutralizeFormula(value));

  if (type === 'price-history') {
    const rows = await subscriptionsService.listAllPriceHistory(ctx);
    startCsv(res, `subtracker-price-history-${date}.csv`);
    res.write(
      csvRow(['Subscription', 'Effective date', 'Price', 'Currency', 'Recorded at', 'Source']),
    );
    for (const r of rows) {
      res.write(
        csvRow([
          text(r.name),
          r.effectiveDate,
          formatAmount(r.amountMinor, r.currency),
          r.currency,
          r.recordedAt.toISOString(),
          r.source === 'initial' ? 'starting price' : 'manual update',
        ]),
      );
    }
    res.end();
    return;
  }

  const subs = await subscriptionsService.listAllSubscriptions(ctx);
  startCsv(res, `subtracker-subscriptions-${date}.csv`);
  res.write(
    csvRow([
      'Name',
      'Category',
      'Price',
      'Currency',
      'Billing frequency',
      'Next billing date',
      'Status',
      'Start date',
      'End date',
      'Payment method',
      'Notes',
      'Created at',
    ]),
  );
  for (const s of subs) {
    res.write(
      csvRow([
        text(s.name),
        s.category.name,
        s.amount,
        s.currency,
        describeFrequency(s.billingInterval, s.billingIntervalCount),
        s.nextBillingDate,
        s.state,
        s.startDate,
        s.endDate,
        text(s.paymentMethodLabel),
        text(s.notes),
        s.createdAt,
      ]),
    );
  }
  res.end();
};
