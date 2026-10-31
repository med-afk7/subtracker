import { useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage } from '../api/client';
import type { Credentials } from '../types';

interface AuthFormProps {
  title: string;
  submitLabel: string;
  onSubmit: (credentials: Credentials) => Promise<void>;
  // Lets password managers offer a saved password (login) or suggest a new one (sign-up)
  passwordAutoComplete: 'current-password' | 'new-password';
  footer: ReactNode;
  // Extra content under the error message, e.g. a "resend email" button
  children?: ReactNode;
}

// Shared email/password form used by the login and sign-up pages
export default function AuthForm({
  title,
  submitLabel,
  onSubmit,
  passwordAutoComplete,
  footer,
  children,
}: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await onSubmit({ email, password });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="card auth-card" onSubmit={handleSubmit}>
      <h1>{title}</h1>

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

      <label>
        Password
        <input
          type="password"
          autoComplete={passwordAutoComplete}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={passwordAutoComplete === 'new-password' ? 8 : undefined}
          required
        />
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {children}

      <button className="button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Please wait…' : submitLabel}
      </button>

      <p className="muted">{footer}</p>
    </form>
  );
}
