import type { Request, RequestHandler } from 'express';
import { SESSION_COOKIE_NAME } from '../../config/cookie.js';
import { unauthenticated } from '../../lib/errors.js';
import { findSession } from '../../services/sessions.service.js';

// Rejects the request unless its session cookie matches a live session in the database
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
  const session = typeof token === 'string' && token !== '' ? await findSession(token) : null;
  if (!session) throw unauthenticated();

  req.auth = {
    userId: session.user.id,
    sessionId: session.sessionId,
    timezone: session.user.timezone,
  };
  next();
};

// For handlers behind requireAuth: the authenticated user and session, with non-null types
export function currentAuth(req: Request) {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}

export const currentUserId = (req: Request) => currentAuth(req).userId;
