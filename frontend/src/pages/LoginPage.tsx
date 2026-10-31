import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import AuthForm from '../components/AuthForm';
import ResendVerification from '../components/ResendVerification';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, notice, clearNotice } = useAuth();
  // Set when the password was right but the email isn't confirmed yet
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

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
      {unverifiedEmail && <ResendVerification email={unverifiedEmail} />}
    </AuthForm>
  );
}
