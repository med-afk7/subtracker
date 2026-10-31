import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '../../api/client';
import * as notificationsApi from '../../api/notifications.api';
import type { NotificationPreferences } from '../../types';

const DAY_CHOICES = [0, 1, 2, 3, 5, 7, 14];
const dayLabel = (days: number) =>
  days === 0 ? 'On the day' : `${days} day${days === 1 ? '' : 's'} before`;

export default function ReminderSettings() {
  const [saved, setSaved] = useState<NotificationPreferences | null>(null);
  const [form, setForm] = useState<NotificationPreferences | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    notificationsApi
      .getPreferences()
      .then((prefs) => {
        setSaved(prefs);
        setForm(prefs);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (!form || !saved)
    return error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setError('');
    setIsSaving(true);
    try {
      const updated = await notificationsApi.updatePreferences(form);
      setSaved(updated);
      setForm(updated);
      setMessage('Reminder settings saved.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const unchanged =
    form.remindersEnabled === saved.remindersEnabled &&
    form.defaultReminderDaysBefore === saved.defaultReminderDaysBefore;
  // Keep a custom value from the API selectable even if it isn't one of the presets
  const choices = DAY_CHOICES.includes(form.defaultReminderDaysBefore)
    ? DAY_CHOICES
    : [...DAY_CHOICES, form.defaultReminderDaysBefore].sort((a, b) => a - b);

  return (
    <form className="stack-form" onSubmit={handleSubmit}>
      <p className="muted section-intro">
        We email you before a subscription is expected to renew, at 9:00 in your timezone. You can
        change or turn off reminders for each subscription too.
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={form.remindersEnabled}
          onChange={(e) => setForm({ ...form, remindersEnabled: e.target.checked })}
        />
        Email me before charges
      </label>
      <div className="inline-field">
        <label>
          Default reminder
          <select
            value={form.defaultReminderDaysBefore}
            disabled={!form.remindersEnabled}
            onChange={(e) =>
              setForm({ ...form, defaultReminderDaysBefore: Number(e.target.value) })
            }
          >
            {choices.map((days) => (
              <option key={days} value={days}>
                {dayLabel(days)}
              </option>
            ))}
          </select>
        </label>
        <button className="button" type="submit" disabled={isSaving || unchanged}>
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
    </form>
  );
}
