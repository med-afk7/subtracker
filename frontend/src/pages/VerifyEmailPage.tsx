import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';

// Opened from the confirmation email: /verify-email?token=...
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { verifyEmail } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(token ? '' : 'This link is missing its token.');
  // The token is single-use, so make sure React's development double-run doesn't spend it twice
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyEmail(token)
      .then(() => navigate('/', { replace: true }))
      .catch((err) => setError(errorMessage(err)));
  }, [token, verifyEmail, navigate]);

  return (
    <div className="card auth-card">
      <h1>Confirming your email</h1>
      {error ? (
        <>
          <p className="error" role="alert">
            {error}
          </p>
          <p className="muted">
            <Link to="/login">Log in</Link> to request a new confirmation link.
          </p>
        </>
      ) : (
        <p className="muted">One moment…</p>
      )}
    </div>
  );
}
