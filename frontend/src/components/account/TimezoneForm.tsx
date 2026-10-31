import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../api/client';
import { useAuth, useCurrentUser } from '../../context/AuthContext';

// Every IANA zone the browser knows, with UTC added (some browsers leave it out)
const TIMEZONES = Array.from(new Set(['UTC', ...Intl.supportedValuesOf('timeZone')]));
const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function TimezoneForm() {
  const user = useCurrentUser();
  const { updateTimezone } = useAuth();
  const [timezone, setTimezone] = useState(user.timezone);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setError('');
    setIsSaving(true);
    try {
      await updateTimezone(timezone);
      setMessage('Timezone saved.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="stack-form" onSubmit={handleSubmit}>
      <p className="muted section-intro">
        Decides what “today” means for renewal dates and when reminders arrive.
      </p>
      <div className="inline-field">
        <label>
          Timezone
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <button className="button" type="submit" disabled={isSaving || timezone === user.timezone}>
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {timezone !== browserTimezone && (
        <button className="link-button" type="button" onClick={() => setTimezone(browserTimezone)}>
          Use this device’s timezone ({browserTimezone.replaceAll('_', ' ')})
        </button>
      )}
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
    </form>
  );
}
