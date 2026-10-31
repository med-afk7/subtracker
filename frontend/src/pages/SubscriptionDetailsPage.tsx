import { useCallback, useEffect, useState } from 'react';
import ServiceIcon from '../components/ServiceIcon';
import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import * as api from '../api/subscriptions.api';
import Modal from '../components/Modal';
import SubscriptionForm from '../components/SubscriptionForm';
import type { PriceHistory, SubscriptionDetails, SubscriptionPatch } from '../types';
import {
  describeDaysUntil,
  describeFrequency,
  describeReminder,
  formatDate,
  formatMoney,
  perPeriod,
} from '../utils/format';

function formatDifference(difference: string, currency: string) {
  const sign = difference.startsWith('-') ? '−' : '+';
  return `${sign}${formatMoney(difference.slice(1), currency)}`;
}

const STATE_LABEL = { active: 'Active', cancelled: 'Cancelled', archived: 'Archived' } as const;

export default function SubscriptionDetailsPage() {
  const { id = '' } = useParams();
  const [sub, setSub] = useState<SubscriptionDetails | null>(null);
  const [history, setHistory] = useState<PriceHistory | null>(null);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([api.getSubscription(id), api.getPriceHistory(id)])
        .then(([s, h]) => {
          setSub(s);
          setHistory(h);
          setError('');
        })
        .catch((err) => setError(errorMessage(err))),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <main className="page">
        <p className="error" role="alert">
          {error}
        </p>
        <Link to="/subscriptions">← All subscriptions</Link>
      </main>
    );
  }
  if (!sub || !history) return <p className="centered">Loading…</p>;

  const details: [string, string | null][] = [
    ['Category', sub.category.name],
    ['Billed', describeFrequency(sub.billingInterval, sub.billingIntervalCount)],
    ['Started', formatDate(sub.startDate)],
    ['Ends', sub.endDate ? formatDate(sub.endDate) : null],
    [
      'Reminder',
      sub.state !== 'active'
        ? null
        : sub.reminderMode === 'default'
          ? 'Account default'
          : describeReminder(sub.reminderMode, sub.reminderDaysBefore),
    ],
    ['Payment method', sub.paymentMethodLabel],
    ['Notes', sub.notes],
  ];

  return (
    <main className="page">
      <Link className="back-link" to="/subscriptions">
        ← All subscriptions
      </Link>
      <div className="page-header">
        <div className="details-title">
          <ServiceIcon service={sub.service} name={sub.name} size="lg" />
          <div>
            <h1>{sub.name}</h1>
            <p className="muted details-price">
              {formatMoney(sub.amount, sub.currency)}{' '}
              {perPeriod(sub.billingInterval, sub.billingIntervalCount)}
              {sub.state !== 'active' && <span className="badge">{STATE_LABEL[sub.state]}</span>}
            </p>
          </div>
        </div>
        <button className="button secondary" onClick={() => setIsEditing(true)}>
          Edit
        </button>
      </div>

      <div className="dashboard-columns">
        <section className="card">
          <h2>Upcoming charges</h2>
          {sub.upcomingBillingDates.length === 0 ? (
            <p className="muted">
              No charges expected{sub.state === 'active' ? ' (it has ended)' : ''}.
            </p>
          ) : (
            <ul className="plain-list">
              {sub.upcomingBillingDates.map((date) => (
                <li key={date} className="change-row">
                  <span className="payment-name">{formatDate(date)}</span>
                  <span className="muted small">{describeDaysUntil(date)}</span>
                  <span className="payment-amount">{formatMoney(sub.amount, sub.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">
            Expected from your billing schedule, not confirmed payments.
          </p>
        </section>

        <section className="card">
          <h2>Details</h2>
          <dl className="details-list">
            {details
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            {sub.providerWebsite && (
              <div>
                <dt>Website</dt>
                <dd>
                  <a href={sub.providerWebsite} target="_blank" rel="noreferrer noopener">
                    {new URL(sub.providerWebsite).hostname}
                  </a>
                </dd>
              </div>
            )}
            {sub.cancellationUrl && (
              <div>
                <dt>Cancel</dt>
                <dd>
                  <a href={sub.cancellationUrl} target="_blank" rel="noreferrer noopener">
                    Cancellation page
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      <section className="card">
        <h2>Price history</h2>
        {history.overall?.difference && (
          <p className="history-summary">
            {history.overall.difference.startsWith('-') ? 'Down' : 'Up'}{' '}
            <strong>
              {formatDifference(history.overall.difference, history.overall.to.currency).slice(1)}
            </strong>{' '}
            since {formatDate(history.overall.from.effectiveDate)} (
            {formatMoney(history.overall.from.amount, history.overall.from.currency)} →{' '}
            {formatMoney(history.overall.to.amount, history.overall.to.currency)})
          </p>
        )}
        <ul className="plain-list">
          {history.entries.map((entry) => (
            <li key={`${entry.effectiveDate}-${entry.recordedAt}`} className="change-row">
              <span className="payment-name">{formatMoney(entry.amount, entry.currency)}</span>
              <span className="muted small">
                {entry.source === 'initial' ? 'Starting price' : 'Changed'} from{' '}
                {formatDate(entry.effectiveDate)}
              </span>
              {entry.difference && (
                <strong className="price-diff">
                  {formatDifference(entry.difference, entry.currency)}
                </strong>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Modal isOpen={isEditing} title="Edit subscription" onClose={() => setIsEditing(false)}>
        <SubscriptionForm
          initial={sub}
          submitLabel="Save"
          onSubmit={async (data) => {
            await api.updateSubscription(sub.id, data as SubscriptionPatch);
            setIsEditing(false);
            await load();
          }}
          onCancel={() => setIsEditing(false)}
        />
      </Modal>
    </main>
  );
}
