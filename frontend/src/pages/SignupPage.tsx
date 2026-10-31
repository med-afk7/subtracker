import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthForm from '../components/AuthForm';
import ResendVerification from '../components/ResendVerification';
import { useAuth } from '../context/AuthContext';

export default function SignupPage() {
  const { register } = useAuth();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  if (submittedEmail) {
    return (
      <div className="card auth-card">
        <h1>Check your email</h1>
        <p>
          We sent a confirmation link to <strong>{submittedEmail}</strong>. Open it to finish
          creating your account. The link expires in 24 hours.
        </p>
        <ResendVerification email={submittedEmail} />
        <p className="muted">
          Already confirmed? <Link to="/login">Log in</Link>
        </p>
      </div>
    );
  }

  return (
    <AuthForm
      title="Create an account"
      submitLabel="Sign up"
      passwordAutoComplete="new-password"
      onSubmit={async (credentials) => {
        await register(credentials);
        setSubmittedEmail(credentials.email.trim());
      }}
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    />
  );
}
