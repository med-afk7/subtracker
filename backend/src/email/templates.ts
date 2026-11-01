import { env } from '../config/env.js';
import type { EmailMessage } from './sender.js';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Same palette as the web app. Email clients ignore stylesheets and web fonts, so every style
// is inline, layout uses tables, and fonts fall back to ones every device has.
const COLORS = {
  bg: '#f6f1ea',
  surface: '#fffdf9',
  text: '#2b2520',
  muted: '#7a6e63',
  border: '#e8dfd3',
  accent: '#b5562f',
};
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";

const paragraph = (html: string) =>
  `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.6;color:${COLORS.text}">${html}</p>`;

const smallPrint = (html: string) =>
  `<p style="margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:1.5;color:${COLORS.muted}">${html}</p>`;

const link = (url: string, label: string) =>
  `<a href="${escapeHtml(url)}" style="color:${COLORS.accent};text-decoration:underline">${escapeHtml(label)}</a>`;

// A table-based button: renders as a real button in Outlook too, not just a styled link
const button = (url: string, label: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px">
  <tr>
    <td bgcolor="${COLORS.accent}" style="border-radius:8px">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;

// The shared frame: logo, white card, footer. `preview` is the line inboxes show after the
// subject; it's hidden in the email itself.
function frame(options: { title: string; preview: string; body: string; footer: string }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(options.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.bg}" style="background:${COLORS.bg}">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
        <tr>
          <td style="padding:0 4px 20px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="font-size:0;line-height:0"><div style="width:14px;height:14px;border-radius:4px;background:${COLORS.accent}"></div></td>
                <td style="padding-left:9px;font-family:${SERIF};font-size:22px;font-weight:600;color:${COLORS.text}">Subly</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td bgcolor="${COLORS.surface}" style="background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:14px;padding:36px 32px 28px">
            <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:26px;line-height:1.25;font-weight:600;color:${COLORS.text}">${escapeHtml(options.title)}</h1>
            ${options.body}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 4px 0">
            ${options.footer}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// Account emails: a short explanation, one button, and the raw URL as a fallback
function actionEmail(options: {
  to: string;
  subject: string;
  title: string;
  intro: string;
  linkLabel: string;
  url: string;
}): EmailMessage {
  const { to, subject, title, intro, linkLabel, url } = options;
  const text = `${intro}\n\n${linkLabel}: ${url}\n\nIf you didn't request this, you can ignore this email.`;
  const html = frame({
    title,
    preview: intro,
    body: [
      paragraph(escapeHtml(intro)),
      button(url, linkLabel),
      smallPrint(
        `Button not working? Paste this link into your browser:<br><span style="word-break:break-all">${link(url, url)}</span>`,
      ),
    ].join('\n'),
    footer: smallPrint("If you didn't request this, you can ignore this email."),
  });
  return { to, subject, text, html };
}

export const verifyEmailMessage = (to: string, token: string) =>
  actionEmail({
    to,
    subject: 'Confirm your email for Subly',
    title: 'Welcome to Subly',
    intro:
      'Welcome to Subly! Confirm your email address to start tracking your subscriptions. The link expires in 24 hours.',
    linkLabel: 'Confirm email',
    url: `${env.appUrl}/verify-email?token=${token}`,
  });

export const resetPasswordMessage = (to: string, token: string) =>
  actionEmail({
    to,
    subject: 'Reset your Subly password',
    title: 'Reset your password',
    intro:
      'Someone asked to reset the password for your Subly account. The link expires in 30 minutes and works once.',
    linkLabel: 'Choose a new password',
    url: `${env.appUrl}/reset-password?token=${token}`,
  });

// Sent when someone tries to register with an address that already has an account,
// so the sign-up response can stay identical for new and existing emails
export const accountExistsMessage = (to: string) =>
  actionEmail({
    to,
    subject: 'You already have a Subly account',
    title: 'You already have an account',
    intro:
      'Someone tried to create a Subly account with this email address, but you already have one. You can log in, or reset your password if you forgot it.',
    linkLabel: 'Reset your password',
    url: `${env.appUrl}/forgot-password`,
  });

const displayAmount = (amount: string, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));

const displayDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

const whenText = (daysBefore: number) =>
  daysBefore === 0 ? 'today' : daysBefore === 1 ? 'tomorrow' : `in ${daysBefore} days`;

// Upcoming-charge reminder. Deterministic for the same inputs, so a retried send produces the
// same email (the provider deduplicates on idempotency key + identical content). It describes
// an expected charge; it never claims one has happened.
export function upcomingChargeMessage(input: {
  to: string;
  subscriptionName: string;
  amount: string; // decimal string, e.g. "15.99"
  currency: string;
  billingDate: string;
  daysBefore: number;
  cancellationUrl: string | null;
}): EmailMessage {
  const amount = displayAmount(input.amount, input.currency);
  const date = displayDate(input.billingDate);
  const when = whenText(input.daysBefore);
  const subject = `${input.subscriptionName} renews ${when} (${amount})`;
  const intro = `${input.subscriptionName} is expected to renew ${when}, on ${date}, for ${amount}.`;
  const disclaimer =
    'This is based on the billing schedule you saved in Subly, not on your bank or the provider.';
  const subscriptionsUrl = `${env.appUrl}/subscriptions`;
  const settingsUrl = `${env.appUrl}/account`;

  const text = [
    intro,
    disclaimer,
    `Review your subscriptions: ${subscriptionsUrl}`,
    input.cancellationUrl
      ? `Thinking of cancelling? Your saved cancellation link: ${input.cancellationUrl}`
      : null,
    `Change reminder settings: ${settingsUrl}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const name = escapeHtml(input.subscriptionName);
  // The charge at a glance: name and date on the left, the amount large on the right
  const chargeCard = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.bg}" style="background:${COLORS.bg};border-radius:12px;margin:4px 0 24px">
  <tr>
    <td style="padding:18px 20px">
      <div style="font-family:${SANS};font-size:17px;font-weight:600;color:${COLORS.text}">${name}</div>
      <div style="font-family:${SANS};font-size:14px;color:${COLORS.muted};padding-top:3px">${escapeHtml(date)}</div>
    </td>
    <td align="right" style="padding:18px 20px;font-family:${SERIF};font-size:26px;font-weight:600;color:${COLORS.text};white-space:nowrap">${escapeHtml(amount)}</td>
  </tr>
</table>`;

  const html = frame({
    title: `${input.subscriptionName} renews ${when}`,
    preview: intro,
    body: [
      paragraph(
        `Heads up: <strong>${name}</strong> is expected to renew <strong>${escapeHtml(when)}</strong>. If you still use it, there’s nothing to do.`,
      ),
      chargeCard,
      button(subscriptionsUrl, 'Review your subscriptions'),
      input.cancellationUrl
        ? paragraph(
            `Thinking of cancelling? ${link(input.cancellationUrl, 'Open your saved cancellation page')}`,
          )
        : '',
    ].join('\n'),
    footer: [
      smallPrint(escapeHtml(disclaimer)),
      smallPrint(`${link(settingsUrl, 'Change reminder settings')}`),
    ].join('\n'),
  });

  return { to: input.to, subject, text, html };
}
