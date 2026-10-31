import { useState, type ChangeEvent, type FormEvent } from 'react';
import { errorMessage } from '../api/client';
import { useCategories } from '../hooks/useCategories';
import type {
  BillingInterval,
  ReminderMode,
  Subscription,
  SubscriptionInput,
  SubscriptionPatch,
} from '../types';
import { CURRENCIES, FREQUENCY_PRESETS, describeFrequency, todayIso } from '../utils/format';

// Number and date inputs stay strings while the user types
interface FormState {
  name: string;
  category: string;
  amount: string;
  currency: string;
  frequency: string; // "month:1", "year:1"...
  startDate: string;
  nextBillingDate: string;
  endDate: string;
  reminderMode: ReminderMode;
  reminderDaysBefore: string;
  paymentMethodLabel: string;
  providerWebsite: string;
  cancellationUrl: string;
  notes: string;
  priceEffectiveDate: string;
}

const frequencyKey = (interval: BillingInterval, count: number) => `${interval}:${count}`;
const parseFrequency = (key: string) => {
  const [interval, count] = key.split(':');
  return { billingInterval: interval as BillingInterval, billingIntervalCount: Number(count) };
};

const EMPTY_FORM: FormState = {
  name: '',
  category: 'other',
  amount: '',
  currency: 'USD',
  frequency: 'month:1',
  startDate: todayIso(),
  nextBillingDate: '',
  endDate: '',
  reminderMode: 'default',
  reminderDaysBefore: '3',
  paymentMethodLabel: '',
  providerWebsite: '',
  cancellationUrl: '',
  notes: '',
  priceEffectiveDate: '',
};

const toFormState = (s: Subscription): FormState => ({
  name: s.name,
  category: s.category.slug,
  amount: s.amount,
  currency: s.currency,
  frequency: frequencyKey(s.billingInterval, s.billingIntervalCount),
  startDate: s.startDate,
  nextBillingDate: s.nextBillingDate ?? '',
  endDate: s.endDate ?? '',
  reminderMode: s.reminderMode,
  reminderDaysBefore: String(s.reminderDaysBefore ?? 3),
  paymentMethodLabel: s.paymentMethodLabel ?? '',
  providerWebsite: s.providerWebsite ?? '',
  cancellationUrl: s.cancellationUrl ?? '',
  notes: s.notes ?? '',
  priceEffectiveDate: '',
});

interface SubscriptionFormProps {
  // Editing an existing subscription; omitted when adding
  initial?: Subscription;
  submitLabel: string;
  onSubmit: (data: SubscriptionInput | SubscriptionPatch) => Promise<void>;
  onCancel?: () => void;
}

export default function SubscriptionForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: SubscriptionFormProps) {
  const categories = useCategories();
  const [form, setForm] = useState<FormState>(initial ? toFormState(initial) : EMPTY_FORM);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = initial !== undefined;
  const original = initial ? toFormState(initial) : EMPTY_FORM;
  const frequencyChanged = isEditing && form.frequency !== original.frequency;
  const priceChanged =
    isEditing && (form.amount !== original.amount || form.currency !== original.currency);

  // Offer the subscription's own frequency even if it isn't one of the presets
  const frequencies: { key: string; label: string }[] = FREQUENCY_PRESETS.map((p) => ({
    key: frequencyKey(p.interval, p.count),
    label: p.label,
  }));
  if (!frequencies.some((f) => f.key === form.frequency)) {
    const { billingInterval, billingIntervalCount } = parseFrequency(form.frequency);
    frequencies.push({
      key: form.frequency,
      label: describeFrequency(billingInterval, billingIntervalCount),
    });
  }

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const buildPayload = (): SubscriptionInput | SubscriptionPatch => {
    const base = {
      name: form.name,
      category: form.category,
      amount: form.amount.trim(),
      currency: form.currency,
      ...parseFrequency(form.frequency),
      startDate: form.startDate,
      endDate: form.endDate || null,
      reminderMode: form.reminderMode,
      reminderDaysBefore: form.reminderMode === 'custom' ? Number(form.reminderDaysBefore) : null,
      paymentMethodLabel: form.paymentMethodLabel || null,
      providerWebsite: form.providerWebsite || null,
      cancellationUrl: form.cancellationUrl || null,
      notes: form.notes || null,
    };
    if (!isEditing) {
      return {
        ...base,
        ...(form.nextBillingDate ? { nextBillingDate: form.nextBillingDate } : {}),
      };
    }
    // Only re-anchor the schedule when the user changed the date or the frequency
    const reanchor = frequencyChanged || form.nextBillingDate !== original.nextBillingDate;
    return {
      ...base,
      ...(reanchor && form.nextBillingDate ? { nextBillingDate: form.nextBillingDate } : {}),
      ...(priceChanged && form.priceEffectiveDate
        ? { priceEffectiveDate: form.priceEffectiveDate }
        : {}),
    };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit(buildPayload());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="subscription-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Name
          <input name="name" value={form.name} onChange={handleChange} maxLength={100} required />
        </label>
        <label>
          Category
          <select name="category" value={form.category} onChange={handleChange}>
            {categories.length === 0 && <option value={form.category}>…</option>}
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-row">
        <label>
          Price
          <input
            name="amount"
            inputMode="decimal"
            placeholder="9.99"
            pattern="\d+(\.\d+)?"
            title="A number like 9.99"
            value={form.amount}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Currency
          <select name="currency" value={form.currency} onChange={handleChange}>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Billed
          <select name="frequency" value={form.frequency} onChange={handleChange}>
            {frequencies.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {priceChanged && (
        <label className="narrow">
          Price changed on
          <input
            name="priceEffectiveDate"
            type="date"
            max={todayIso()}
            value={form.priceEffectiveDate}
            onChange={handleChange}
          />
          <span className="field-hint">
            Leave empty for today. The old price stays in the history.
          </span>
        </label>
      )}

      <div className="form-row">
        <label>
          Started on
          <input
            name="startDate"
            type="date"
            value={form.startDate}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Next billing date
          <input
            name="nextBillingDate"
            type="date"
            min={form.startDate}
            value={form.nextBillingDate}
            onChange={handleChange}
            required={frequencyChanged}
          />
          <span className="field-hint">
            {frequencyChanged
              ? 'Confirm when the new schedule bills next.'
              : isEditing
                ? 'Change it if the provider moved your billing date.'
                : 'Optional. Leave empty if billing follows the start date.'}
          </span>
        </label>
      </div>

      <div className="form-row">
        <label>
          Reminder
          <select name="reminderMode" value={form.reminderMode} onChange={handleChange}>
            <option value="default">Account default</option>
            <option value="custom">Custom</option>
            <option value="off">Off</option>
          </select>
        </label>
        {form.reminderMode === 'custom' && (
          <label>
            Days before billing
            <input
              name="reminderDaysBefore"
              type="number"
              min="0"
              max="30"
              value={form.reminderDaysBefore}
              onChange={handleChange}
              required
            />
          </label>
        )}
      </div>

      <details
        className="more-details"
        open={Boolean(original.notes || original.providerWebsite || original.endDate)}
      >
        <summary>More details</summary>
        <div className="form-row">
          <label>
            Payment method
            <input
              name="paymentMethodLabel"
              placeholder="e.g. Visa ending 1234"
              maxLength={50}
              value={form.paymentMethodLabel}
              onChange={handleChange}
            />
          </label>
          <label>
            Ends on
            <input
              name="endDate"
              type="date"
              min={form.startDate}
              value={form.endDate}
              onChange={handleChange}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Website
            <input
              name="providerWebsite"
              type="url"
              placeholder="https://"
              value={form.providerWebsite}
              onChange={handleChange}
            />
          </label>
          <label>
            Cancellation link
            <input
              name="cancellationUrl"
              type="url"
              placeholder="https://"
              value={form.cancellationUrl}
              onChange={handleChange}
            />
          </label>
        </div>
        <label>
          Notes
          <textarea
            name="notes"
            rows={2}
            maxLength={1000}
            value={form.notes}
            onChange={handleChange}
          />
        </label>
      </details>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button className="button secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
