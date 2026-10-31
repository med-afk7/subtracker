import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendOptions {
  // Same key + same message within 24 hours = sent once (provider-side deduplication)
  idempotencyKey?: string;
}

export interface SendResult {
  providerMessageId: string | null;
}

export interface EmailSender {
  send(message: EmailMessage, options?: SendOptions): Promise<SendResult>;
}

// A failed send, classified so the caller knows whether trying again can help
export class EmailSendError extends Error {
  constructor(
    readonly code: string,
    message: string,
    // true: network trouble, rate limits, provider outages. false: fix needed first.
    readonly transient: boolean,
    // The provider says this exact key was already used for an accepted send
    readonly alreadyAccepted = false,
  ) {
    super(message);
    this.name = 'EmailSendError';
  }
}

// Development without an API key: write the email (including its links) to the log
export const consoleSender: EmailSender = {
  async send(message) {
    logger.info(
      { to: message.to, subject: message.subject },
      `Email (not sent)\n\n${message.text}`,
    );
    return { providerMessageId: null };
  },
};

// Resend error names that are worth retrying (https://resend.com/docs/api-reference/errors):
// rate limits, a daily quota that resets at midnight UTC, locks and in-flight duplicates
const TRANSIENT_ERRORS = new Set([
  'rate_limit_exceeded',
  'daily_quota_exceeded',
  'concurrent_idempotent_requests',
  'resource_locked',
]);

export function classifyResendError(status: number, name: string | undefined, message: string) {
  const code = name ?? `http_${status}`;
  // Reusing a key with a different body means an earlier attempt was accepted (e.g. the price
  // changed between a crashed attempt and this retry): the reminder already went out
  if (name === 'invalid_idempotent_request') return new EmailSendError(code, message, false, true);
  const transient = status >= 500 || (name !== undefined && TRANSIENT_ERRORS.has(name));
  return new EmailSendError(code, message, transient);
}

// Resend's REST API: https://resend.com/docs/api-reference/emails/send-email
export function createResendSender(apiKey: string, from: string): EmailSender {
  return {
    async send(message, options = {}) {
      let response: Response;
      try {
        response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (err) {
        // DNS failures, resets, timeouts: the request may not have arrived, so try again later
        throw new EmailSendError('network_error', (err as Error).message, true);
      }

      const body = (await response.json().catch(() => ({}))) as {
        id?: string;
        name?: string;
        message?: string;
      };
      if (!response.ok) {
        throw classifyResendError(response.status, body.name, body.message ?? response.statusText);
      }
      return { providerMessageId: body.id ?? null };
    },
  };
}

let activeSender: EmailSender = env.resendApiKey
  ? createResendSender(env.resendApiKey, env.emailFrom)
  : consoleSender;

// Lets tests capture emails instead of sending them
export function setEmailSender(sender: EmailSender) {
  activeSender = sender;
}

export const getEmailSender = () => activeSender;

// Fire-and-forget for auth emails: the HTTP response doesn't wait for the provider, so a slow
// provider can't slow down (or reveal anything through the timing of) the request.
// A failed send is logged; the user can request the email again.
export function sendEmailInBackground(message: EmailMessage, purpose: string) {
  activeSender.send(message).catch((err: unknown) => {
    logger.error({ err, purpose }, 'Email delivery failed');
  });
}
