import { useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage } from '../api/client';
import type { Subscription } from '../types';
import { todayIso } from '../utils/format';

// Shared shell: a short explanation, one date field, and confirm/cancel buttons
function DateActionForm(props: {
  intro: ReactNode;
  label: string;
  hint?: string;
  required: boolean;
  min?: string;
  initialDate: string;
  confirmLabel: string;
  onConfirm: (date: string) => Promise<void>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(props.initialDate);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      await props.onConfirm(date);
    } catch (err) {
      setError(errorMessage(err));
      setIsSaving(false);
    }
  };

  return (
    <form className="subscription-form" onSubmit={handleSubmit}>
      <div className="section-intro">{props.intro}</div>
      <label className="narrow">
        {props.label}
        <input
          type="date"
          min={props.min}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required={props.required}
        />
        {props.hint && <span className="field-hint">{props.hint}</span>}
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="button" type="submit" disabled={isSaving}>
          {isSaving ? 'Saving…' : props.confirmLabel}
        </button>
        <button className="button secondary" type="button" onClick={props.onClose}>
          Back
        </button>
      </div>
    </form>
  );
}

export function CancelForm({
  subscription,
  onConfirm,
  onClose,
}: {
  subscription: Subscription;
  onConfirm: (endDate: string | null) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <DateActionForm
      intro={
        <p>
          This records that you cancelled <strong>{subscription.name}</strong>. Subtracker can’t
          cancel it with the provider, so make sure you’ve done that too
          {subscription.cancellationUrl ? (
            <>
              {' '}
              (
              <a href={subscription.cancellationUrl} target="_blank" rel="noreferrer noopener">
                your cancellation link
              </a>
              )
            </>
          ) : null}
          .
        </p>
      }
      label="Access ends on"
      hint="Optional: the last day you can still use it."
      required={false}
      min={subscription.startDate}
      initialDate={subscription.nextBillingDate ?? ''}
      confirmLabel="Mark as cancelled"
      onConfirm={(date) => onConfirm(date || null)}
      onClose={onClose}
    />
  );
}

export function ReactivateForm({
  subscription,
  onConfirm,
  onClose,
}: {
  subscription: Subscription;
  onConfirm: (nextBillingDate: string) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <DateActionForm
      intro={
        <p>
          When will <strong>{subscription.name}</strong> bill you next? The schedule restarts from
          that date.
        </p>
      }
      label="Next billing date"
      required
      min={subscription.startDate}
      initialDate={todayIso()}
      confirmLabel="Reactivate"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
