import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import * as authApi from '../api/auth.api';

// Opened from the reset email: /reset-password?token=...
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState(token ? '' : 'This link is missing its token.');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setIsDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isDone) {
    return (
      <div className="card auth-card">
        <h1>Password updated</h1>
        <p>You’ve been logged out on every device. Log in with your new password.</p>
        <Link className="button" to="/login">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <form className="card auth-card" onSubmit={handleSubmit}>
      <h1>Choose a new password</h1>
      <label>
        New password
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button" type="submit" disabled={isSubmitting || !token}>
        {isSubmitting ? 'Saving…' : 'Save new password'}
      </button>
      <p className="muted">
        Link expired? <Link to="/forgot-password">Request a new one</Link>
      </p>
    </form>
  );
}
