import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import * as authApi from '../api/auth.api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await authApi.forgotPassword(email);
      setIsSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSent) {
    return (
      <div className="card auth-card">
        <h1>Check your email</h1>
        <p>
          If <strong>{email.trim()}</strong> has an account, we sent it a link to choose a new
          password. The link expires in 30 minutes.
        </p>
        <p className="muted">
          <Link to="/login">Back to log in</Link>
        </p>
      </div>
    );
  }

  return (
    <form className="card auth-card" onSubmit={handleSubmit}>
      <h1>Reset your password</h1>
      <p className="muted">Enter your email and we’ll send you a link to choose a new password.</p>
      <label>
        Email
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Sending…' : 'Send reset link'}
      </button>
      <p className="muted">
        <Link to="/login">Back to log in</Link>
      </p>
    </form>
  );
}
