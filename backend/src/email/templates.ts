import { env } from '../config/env.js';
import type { EmailMessage } from './sender.js';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Plain layout: a paragraph, one button-style link, and the raw URL as a fallback
function layout(to: string, subject: string, intro: string, linkLabel: string, url: string) {
  const text = `${intro}\n\n${linkLabel}: ${url}\n\nIf you didn't request this, you can ignore this email.`;
  const html = `<p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(url)}">${escapeHtml(linkLabel)}</a></p>
<p style="color:#7a6e63;font-size:13px">Or paste this link into your browser: ${escapeHtml(url)}</p>
<p style="color:#7a6e63;font-size:13px">If you didn't request this, you can ignore this email.</p>`;
  return { to, subject, text, html } satisfies EmailMessage;
}

export const verifyEmailMessage = (to: string, token: string) =>
  layout(
    to,
    'Confirm your email for Subly',
    'Welcome to Subly! Confirm your email address to start tracking your subscriptions. The link expires in 24 hours.',
    'Confirm email',
    `${env.appUrl}/verify-email?token=${token}`,
  );

export const resetPasswordMessage = (to: string, token: string) =>
  layout(
    to,
    'Reset your Subly password',
    'Someone asked to reset the password for your Subly account. The link expires in 30 minutes and works once.',
    'Choose a new password',
    `${env.appUrl}/reset-password?token=${token}`,
  );

// Sent when someone tries to register with an address that already has an account,
// so the sign-up response can stay identical for new and existing emails
export const accountExistsMessage = (to: string) =>
  layout(
    to,
    'You already have a Subly account',
    'Someone tried to create a Subly account with this email address, but you already have one. You can log in, or reset your password if you forgot it.',
    'Reset your password',
    `${env.appUrl}/forgot-password`,
  );

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
  const subject = `${input.subscriptionName} renews ${whenText(input.daysBefore)} (${amount})`;
  const intro = `${input.subscriptionName} is expected to renew ${whenText(input.daysBefore)}, on ${date}, for ${amount}.`;
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

  const html = `<p>${escapeHtml(intro)}</p>
<p style="color:#7a6e63;font-size:13px">${escapeHtml(disclaimer)}</p>
<p><a href="${escapeHtml(subscriptionsUrl)}">Review your subscriptions</a></p>
${
  input.cancellationUrl
    ? `<p>Thinking of cancelling? <a href="${escapeHtml(input.cancellationUrl)}">Your saved cancellation link</a></p>`
    : ''
}
<p style="color:#7a6e63;font-size:13px"><a href="${escapeHtml(settingsUrl)}">Change reminder settings</a></p>`;

  return { to: input.to, subject, text, html };
}
