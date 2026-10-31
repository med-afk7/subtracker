import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import GoogleButton from '../components/GoogleButton';
import ServiceIcon from '../components/ServiceIcon';
import { describeDaysUntil, formatMoney } from '../utils/format';

// Dates in the preview are relative to today, so the sample never looks stale
function daysFromToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const SAMPLE = [
  { service: 'netflix', name: 'Netflix', amount: '15.49', inDays: 2 },
  { service: 'spotify', name: 'Spotify', amount: '11.99', inDays: 6 },
  { service: 'icloud', name: 'iCloud+', amount: '2.99', inDays: 11 },
  { service: 'notion', name: 'Notion', amount: '10.00', inDays: 19 },
];
const SAMPLE_TOTAL = SAMPLE.reduce((sum, s) => sum + Number(s.amount), 0).toFixed(2);

// Only services with a logo (a letter tile would look like a missing image here)
const LOGO_STRIP = [
  'netflix',
  'spotify',
  'youtube-premium',
  'apple-music',
  'icloud',
  'notion',
  'figma',
  'github',
  'dropbox',
  'duolingo',
  'twitch',
  '1password',
];

// Small line icons for the feature cards (24x24, drawn with the current text color)
const icons: Record<string, ReactNode> = {
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />,
  tag: (
    <>
      <path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9-8-8Z" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </>
  ),
};

function FeatureIcon({ name }: { name: keyof typeof icons }) {
  return (
    <span className="feature-icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icons[name]}
      </svg>
    </span>
  );
}

const FEATURES = [
  {
    icon: 'bell',
    title: 'A heads-up before every charge',
    text: 'An email a few days before each renewal, so cancelling is still an option. Pick how early, per subscription.',
  },
  {
    icon: 'calendar',
    title: 'Every renewal on a calendar',
    text: 'Weekly, monthly, yearly or every few months: see exactly which days money leaves your account.',
  },
  {
    icon: 'chart',
    title: 'What the year will really cost',
    text: 'A twelve-month forecast and spending by category, in each currency you pay in.',
  },
  {
    icon: 'tag',
    title: 'Catch quiet price increases',
    text: 'Each price change is kept in a history, so you can see when a service got more expensive.',
  },
] as const;

const STEPS = [
  ['Add what you pay for', 'Pick from popular services or type your own. No bank login needed.'],
  ['Get reminded', 'We email you before renewals, on the schedule you choose.'],
  ['Keep or cancel', 'Decide with the date and price in front of you, not after the charge.'],
];

function ProductPreview() {
  return (
    <div className="landing-preview" aria-label="Example of the Subtracker dashboard">
      <div className="card preview-card">
        <div className="preview-header">
          <span className="preview-title">Upcoming renewals</span>
          <span className="muted small">Next 30 days</span>
        </div>
        <ul className="plain-list">
          {SAMPLE.map((s) => (
            <li key={s.service} className="preview-row">
              <ServiceIcon service={s.service} name={s.name} />
              <span className="preview-name">
                {s.name}
                <span className="muted small">{describeDaysUntil(daysFromToday(s.inDays))}</span>
              </span>
              <span className="preview-amount">{formatMoney(s.amount, 'USD')}</span>
            </li>
          ))}
        </ul>
        <div className="preview-total">
          <span className="muted">This month</span>
          <strong>{formatMoney(SAMPLE_TOTAL, 'USD')}</strong>
        </div>
      </div>

      <div className="preview-reminder" aria-hidden="true">
        <span className="preview-reminder-dot" />
        <span>
          <strong>Netflix renews in 2 days</strong>
          <span className="muted small">{formatMoney('15.49', 'USD')} · reminder sent</span>
        </span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="landing">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Subscription tracker</p>
          <h1>Know what you pay for, before it renews.</h1>
          <p className="landing-lede">
            Subtracker keeps all your subscriptions in one place, emails you before each charge, and
            shows what they’ll cost you this year.
          </p>
          <div className="landing-actions">
            <Link className="button large" to="/signup">
              Get started, it’s free
            </Link>
            <GoogleButton />
          </div>
          <p className="muted small">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
        <ProductPreview />
      </section>

      <section className="landing-logos" aria-label="Popular services you can add">
        <p className="muted small">Ready-made for the services you already use, or add your own</p>
        <div className="logo-strip">
          {LOGO_STRIP.map((slug) => (
            <ServiceIcon key={slug} service={slug} name={slug} />
          ))}
        </div>
      </section>

      <section className="landing-features">
        {FEATURES.map((f) => (
          <article key={f.title} className="card feature-card">
            <FeatureIcon name={f.icon} />
            <h2>{f.title}</h2>
            <p className="muted">{f.text}</p>
          </article>
        ))}
      </section>

      <section className="landing-steps">
        <h2>How it works</h2>
        <ol>
          {STEPS.map(([title, text], index) => (
            <li key={title}>
              <span className="step-number">{index + 1}</span>
              <div>
                <strong>{title}</strong>
                <p className="muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-cta">
        <h2>Stop paying for things you forgot about.</h2>
        <p className="muted">It takes about two minutes to add your first subscriptions.</p>
        <Link className="button large" to="/signup">
          Create your free account
        </Link>
      </section>

      <footer className="landing-footer muted small">
        <span>Subtracker</span>
        <span className="footer-links">
          <Link to="/privacy">Privacy</Link>
          <a href="/api/docs">API docs</a>
        </span>
      </footer>
    </main>
  );
}
