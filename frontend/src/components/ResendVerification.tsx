import { useState } from 'react';
import { errorMessage } from '../api/client';
import * as authApi from '../api/auth.api';

// "Didn't get the email?" button. The API answers the same whether or not the address
// has an account, so the message never reveals that either.
export default function ResendVerification({ email }: { email: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  const resend = async () => {
    setStatus('sending');
    setError('');
    try {
      await authApi.resendVerification(email);
      setStatus('sent');
    } catch (err) {
      setError(errorMessage(err));
      setStatus('idle');
    }
  };

  if (status === 'sent') {
    return <p className="success">If that address needs confirming, a new link is on its way.</p>;
  }

  return (
    <div className="notice">
      <span>Didn’t get the email?</span>
      <button
        className="link-button"
        type="button"
        onClick={resend}
        disabled={status === 'sending'}
      >
        {status === 'sending' ? 'Sending…' : 'Send it again'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
