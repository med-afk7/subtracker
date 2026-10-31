import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import * as notificationsApi from '../../api/notifications.api';
import type { ReminderDelivery } from '../../types';
import { formatDate, formatMoney } from '../../utils/format';

// What happened to each reminder, in words. Failures stay visible instead of disappearing.
function describeStatus(d: ReminderDelivery): {
  label: string;
  tone: 'ok' | 'pending' | 'problem' | 'muted';
} {
  switch (d.status) {
    case 'sent':
      return { label: d.sentAt ? `Sent ${formatDate(d.sentAt.slice(0, 10))}` : 'Sent', tone: 'ok' };
    case 'pending':
    case 'sending':
      return { label: 'Sending', tone: 'pending' };
    case 'retrying':
      return { label: `Retrying (attempt ${d.attemptCount} failed)`, tone: 'pending' };
    case 'failed':
      return {
        label: `Couldn’t be delivered${d.lastErrorCode ? ` (${d.lastErrorCode})` : ''}`,
        tone: 'problem',
      };
    case 'skipped':
      return { label: 'Not sent: no longer needed', tone: 'muted' };
  }
}

export default function ReminderHistory() {
  const [deliveries, setDeliveries] = useState<ReminderDelivery[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    notificationsApi
      .getDeliveries()
      .then((result) => setDeliveries(result.data))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!deliveries) return <p className="muted">Loading…</p>;
  if (deliveries.length === 0)
    return <p className="muted">No reminders yet. They’ll appear here as they’re sent.</p>;

  return (
    <ul className="plain-list">
      {deliveries.map((d) => {
        const status = describeStatus(d);
        return (
          <li key={d.id} className="change-row">
            <span className="payment-name">{d.subscriptionName}</span>
            <span className="muted small">
              {formatMoney(d.amount, d.currency)} on {formatDate(d.billingDate)}
            </span>
            <span className={`status-tag ${status.tone}`}>{status.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
