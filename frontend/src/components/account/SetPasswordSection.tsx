import { useState } from 'react';
import * as authApi from '../../api/auth.api';
import { errorMessage } from '../../api/client';
import { useCurrentUser } from '../../context/AuthContext';

// For accounts created with Google: adding a password goes through the emailed reset link,
// which proves the person at the keyboard owns the inbox (not just this logged-in browser)
export default function SetPasswordSection() {
  const { email } = useCurrentUser();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);

  const send = async () => {
    setError('');
    setIsSending(true);
    try {
      await authApi.forgotPassword(email);
      setMessage(`We sent a link to ${email}. Open it to choose a password.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="stack-form">
      <p className="muted section-intro">
        You sign in with Google. Add a password if you’d also like to log in with your email.
      </p>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      {!message && (
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={send} disabled={isSending}>
            {isSending ? 'Sending…' : 'Email me a link to set a password'}
          </button>
        </div>
      )}
    </div>
  );
}
