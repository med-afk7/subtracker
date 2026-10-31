import { pino } from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.logLevel,
  // Credentials must never reach the logs, even when a whole request or body is logged
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.token',
    ],
    censor: '[redacted]',
  },
});
