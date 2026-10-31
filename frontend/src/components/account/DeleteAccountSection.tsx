import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Two steps: reveal the form, then confirm with the password
export default function DeleteAccountSection() {
  const { deleteAccount } = useAuth();
  const [isConfirming, setIsConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsDeleting(true);
    try {
      await deleteAccount(password);
    } catch (err) {
      setError(errorMessage(err));
      setIsDeleting(false);
    }
  };

  if (!isConfirming) {
    return (
      <div className="stack-form">
        <p className="muted section-intro">
          Permanently deletes your account and every subscription you’ve saved. This can’t be
          undone.
        </p>
        <div className="form-actions">
          <button className="button danger" type="button" onClick={() => setIsConfirming(true)}>
            Delete account…
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="stack-form" onSubmit={handleSubmit}>
      <p className="section-intro">
        <strong>Enter your password to permanently delete your account and all its data.</strong>
      </p>
      <div className="inline-field">
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button className="button danger-solid" type="submit" disabled={isDeleting}>
          {isDeleting ? 'Deleting…' : 'Delete my account'}
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setIsConfirming(false);
            setPassword('');
            setError('');
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
