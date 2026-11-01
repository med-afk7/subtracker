import { Link } from 'react-router-dom';

// Plain-language privacy policy. Keep it in step with what the API actually stores
// (backend/src/db/schema.ts) and the services listed in docs/deployment.md.
const UPDATED = 'October 31, 2026';
const REPO = 'https://github.com/med-afk7/subtracker';

export default function PrivacyPage() {
  return (
    <main className="page legal">
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <article className="card">
        <h1>Privacy policy</h1>
        <p className="muted small">Last updated {UPDATED}</p>

        <p>
          Subly is a personal project that helps you keep track of your subscriptions. This page
          explains what it stores, why, and how to remove it.
        </p>

        <h2>What we store</h2>
        <ul>
          <li>
            <strong>Your account:</strong> your email address, your timezone, and your password as a
            one-way hash (never the password itself). If you sign in with Google, we receive your
            email address and Google’s account id for you, and nothing else: no name, photo,
            contacts or other Google data.
          </li>
          <li>
            <strong>What you enter:</strong> your subscriptions, their prices and price history,
            billing dates, notes, and reminder settings.
          </li>
          <li>
            <strong>Sessions:</strong> a cookie that keeps you logged in. We store only a hash of
            it. There are no advertising or tracking cookies and no analytics.
          </li>
          <li>
            <strong>Email history:</strong> a record of the reminder emails sent to you, so none is
            sent twice.
          </li>
          <li>
            <strong>Server logs:</strong> technical request logs (time, address, page requested)
            used to keep the service running and secure. Passwords and cookies are removed from
            them.
          </li>
        </ul>

        <h2>How it’s used</h2>
        <p>
          Only to run Subly for you: logging you in, showing your subscriptions, and emailing you
          account messages and the renewal reminders you asked for. Your data is never sold, shared
          for advertising, or used for anything else.
        </p>

        <h2>Services that handle it</h2>
        <ul>
          <li>Vercel (hosts the website) and Render (runs the server)</li>
          <li>Neon (stores the database)</li>
          <li>Resend (sends the emails)</li>
          <li>Google (only if you choose “Continue with Google”)</li>
        </ul>

        <h2>Keeping and deleting your data</h2>
        <p>
          Your data stays until you delete it. <strong>Account → Delete account</strong> removes
          your account and everything in it immediately and permanently. You can download your
          subscriptions and price history as CSV files from the Subscriptions page at any time.
        </p>

        <h2>Security</h2>
        <p>
          Connections are encrypted (HTTPS), passwords are hashed with Argon2id, and each account
          can only see its own data.
        </p>

        <h2>Questions</h2>
        <p>
          Open an issue on the project’s{' '}
          <a href={REPO} target="_blank" rel="noreferrer noopener">
            GitHub page
          </a>
          . If this policy changes, the date at the top will change too.
        </p>
      </article>
    </main>
  );
}
