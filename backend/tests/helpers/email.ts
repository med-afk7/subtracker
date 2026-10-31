import {
  EmailSendError,
  type EmailMessage,
  type EmailSender,
  type SendOptions,
} from '../../src/email/sender.js';

// Emails "sent" during the current test, oldest first (cleared before each test)
export const outbox: (EmailMessage & SendOptions)[] = [];

// Failures to simulate on the next send() calls, consumed in order
const plannedFailures: EmailSendError[] = [];
export function failNextSends(...errors: EmailSendError[]) {
  plannedFailures.push(...errors);
}
export const transientError = () =>
  new EmailSendError('service_unavailable', 'Provider down', true);
export const permanentError = () =>
  new EmailSendError('validation_error', 'Invalid recipient', false);

export function resetFakeEmail() {
  outbox.length = 0;
  plannedFailures.length = 0;
}

export const fakeEmailSender: EmailSender = {
  async send(message, options = {}) {
    const failure = plannedFailures.shift();
    if (failure) throw failure;
    outbox.push({ ...message, ...options });
    return { providerMessageId: `fake-${outbox.length}` };
  },
};

export function lastEmailTo(to: string): EmailMessage {
  const message = outbox.findLast((m) => m.to === to);
  if (!message) throw new Error(`No email sent to ${to}`);
  return message;
}

// Pulls the token out of a link like http://localhost:5173/verify-email?token=abc
export function tokenFrom(message: EmailMessage): string {
  const match = /token=([A-Za-z0-9_-]+)/.exec(message.text);
  if (!match?.[1]) throw new Error(`No token in email "${message.subject}"`);
  return match[1];
}
