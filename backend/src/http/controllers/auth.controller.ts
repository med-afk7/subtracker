import type { RequestHandler, Response } from 'express';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '../../config/cookie.js';
import { unauthenticated } from '../../lib/errors.js';
import * as authService from '../../services/auth.service.js';
import { deleteSession } from '../../services/sessions.service.js';
import { findUserById, toPublicUser } from '../../services/users.service.js';
import { currentAuth, currentUserId } from '../middleware/requireAuth.js';
import {
  changePasswordSchema,
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenOnlySchema,
} from '../schemas/auth.schemas.js';

const CHECK_EMAIL = { message: 'Check your email for a link to continue.' };

function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);
}

export function clearSessionCookie(res: Response) {
  const { maxAge, ...options } = sessionCookieOptions;
  res.clearCookie(SESSION_COOKIE_NAME, options);
}

// Same response for new and existing emails (see auth.service.register)
export const register: RequestHandler = async (req, res) => {
  await authService.register(registerSchema.parse(req.body));
  res.status(202).json({ data: CHECK_EMAIL });
};

export const verifyEmail: RequestHandler = async (req, res) => {
  const { token } = tokenOnlySchema.parse(req.body);
  const { user, sessionToken } = await authService.verifyEmail(token);
  req.log.info({ userId: user.id }, 'Email verified');
  setSessionCookie(res, sessionToken);
  res.status(200).json({ data: toPublicUser(user) });
};

export const resendVerification: RequestHandler = async (req, res) => {
  await authService.resendVerification(emailOnlySchema.parse(req.body).email);
  res.status(202).json({ data: CHECK_EMAIL });
};

export const login: RequestHandler = async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  try {
    const { user, sessionToken } = await authService.login(email, password);
    req.log.info({ userId: user.id }, 'Login succeeded');
    setSessionCookie(res, sessionToken);
    res.status(200).json({ data: toPublicUser(user) });
  } catch (err) {
    req.log.warn({ code: (err as { code?: string }).code }, 'Login failed');
    throw err;
  }
};

export const logout: RequestHandler = async (req, res) => {
  await deleteSession(currentAuth(req).sessionId);
  clearSessionCookie(res);
  res.status(204).end();
};

export const forgotPassword: RequestHandler = async (req, res) => {
  await authService.forgotPassword(emailOnlySchema.parse(req.body).email);
  res.status(202).json({ data: CHECK_EMAIL });
};

export const resetPassword: RequestHandler = async (req, res) => {
  const { token, newPassword } = resetPasswordSchema.parse(req.body);
  const userId = await authService.resetPassword(token, newPassword);
  req.log.info({ userId }, 'Password reset; all sessions revoked');
  clearSessionCookie(res);
  res.status(204).end();
};

export const changePassword: RequestHandler = async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const userId = currentUserId(req);
  const sessionToken = await authService.changePassword(userId, currentPassword, newPassword);
  req.log.info({ userId }, 'Password changed; other sessions revoked');
  setSessionCookie(res, sessionToken);
  res.status(204).end();
};

export const getCurrentUser: RequestHandler = async (req, res) => {
  const user = await findUserById(currentUserId(req));
  if (!user) throw unauthenticated();
  res.status(200).json({ data: toPublicUser(user) });
};
