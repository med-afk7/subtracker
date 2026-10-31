import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function ChangePasswordForm() {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setError('');
    setIsSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Password changed. You’ve been logged out on your other devices.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="stack-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </label>
      </div>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button className="button" type="submit" disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}
