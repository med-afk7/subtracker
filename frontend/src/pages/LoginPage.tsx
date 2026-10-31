import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import AuthForm from '../components/AuthForm';
import ResendVerification from '../components/ResendVerification';
import { useAuth } from '../context/AuthContext';

const GOOGLE_ERRORS: Record<string, string> = {
  cancelled: 'Google sign-in was cancelled.',
  failed:
    'We couldn’t sign you in with Google. If your account is already linked to a different Google account, use that one or your password.',
};

export default function LoginPage() {
  const { login, notice, clearNotice } = useAuth();
  // Set when the password was right but the email isn't confirmed yet
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  // Set by the API when it sends the browser back from an unsuccessful Google sign-in
  const [params] = useSearchParams();
  const googleError = GOOGLE_ERRORS[params.get('google') ?? ''];

  return (
    <AuthForm
      title="Log in"
      submitLabel="Log in"
      passwordAutoComplete="current-password"
      onSubmit={async (credentials) => {
        setUnverifiedEmail(null);
        clearNotice();
        try {
          await login(credentials);
        } catch (err) {
          if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
            setUnverifiedEmail(credentials.email.trim());
          }
          throw err;
        }
      }}
      footer={
        <>
          <Link to="/forgot-password">Forgot your password?</Link>
          <br />
          No account? <Link to="/signup">Sign up</Link>
        </>
      }
    >
      {notice && <p className="success">{notice}</p>}
      {googleError && !notice && (
        <p className="error" role="alert">
          {googleError}
        </p>
      )}
      {unverifiedEmail && <ResendVerification email={unverifiedEmail} />}
    </AuthForm>
  );
}
