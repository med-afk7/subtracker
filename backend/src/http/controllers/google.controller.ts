import type { CookieOptions, RequestHandler, Response } from 'express';
import { env } from '../../config/env.js';
import { isValidTimezone } from '../../domain/timezone.js';
import { generateToken, pkceChallenge, safeEqual } from '../../lib/crypto.js';
import { notFound } from '../../lib/errors.js';
import {
  buildAuthorizationUrl,
  getGoogleTokenClient,
  GoogleAuthError,
  profileFromIdToken,
  type GoogleConfig,
} from '../../oauth/google.js';
import { signInWithGoogle } from '../../services/googleAuth.service.js';
import { googleStartSchema } from '../schemas/auth.schemas.js';
import { setSessionCookie } from './auth.controller.js';

// Holds the one sign-in attempt in progress: only this browser knows these values, so a
// callback that doesn't match them (forged, replayed, or started elsewhere) is refused
const FLOW_COOKIE = 'google_oauth';
const flowCookieOptions: CookieOptions = {
  httpOnly: true,
  // Lax still sends it on the top-level redirect back from Google
  sameSite: 'lax',
  secure: env.isProduction,
  path: '/api/auth/google',
  maxAge: 10 * 60 * 1000,
};

interface Flow {
  state: string;
  codeVerifier: string;
  nonce: string;
  timezone: string;
}

// The callback goes through the web app's host (Vercel proxies /api), so the session cookie
// is set on the app's own site. This exact URL is registered with Google.
const redirectUri = () => `${env.appUrl}/api/auth/google/callback`;

function googleConfig(): GoogleConfig {
  if (!env.google) throw notFound('Google sign-in');
  return env.google;
}

function readFlow(cookie: unknown): Flow | null {
  if (typeof cookie !== 'string') return null;
  try {
    const flow = JSON.parse(Buffer.from(cookie, 'base64url').toString('utf8')) as Partial<Flow>;
    const fields = [flow.state, flow.codeVerifier, flow.nonce, flow.timezone];
    return fields.every((field) => typeof field === 'string') ? (flow as Flow) : null;
  } catch {
    return null;
  }
}

// Back to the app's login page with a short reason the page turns into a message
function failSignIn(res: Response, reason: 'cancelled' | 'failed') {
  res.redirect(303, `${env.appUrl}/login?google=${reason}`);
}

export const getProviders: RequestHandler = (_req, res) => {
  res.status(200).json({ data: { google: env.google !== null } });
};

export const startGoogleSignIn: RequestHandler = (req, res) => {
  const config = googleConfig();
  const { timezone } = googleStartSchema.parse(req.query);

  const flow: Flow = {
    state: generateToken(),
    codeVerifier: generateToken(),
    nonce: generateToken(),
    timezone: timezone && isValidTimezone(timezone) ? timezone : 'UTC',
  };
  res.cookie(
    FLOW_COOKIE,
    Buffer.from(JSON.stringify(flow)).toString('base64url'),
    flowCookieOptions,
  );
  res.redirect(
    303,
    buildAuthorizationUrl(config, {
      redirectUri: redirectUri(),
      state: flow.state,
      nonce: flow.nonce,
      codeChallenge: pkceChallenge(flow.codeVerifier),
    }),
  );
};

export const finishGoogleSignIn: RequestHandler = async (req, res) => {
  const config = googleConfig();
  const flow = readFlow(req.cookies?.[FLOW_COOKIE]);
  // Single use, whatever happens next
  const { maxAge, ...clearOptions } = flowCookieOptions;
  res.clearCookie(FLOW_COOKIE, clearOptions);

  const { code, state, error } = req.query;
  if (typeof error === 'string') {
    req.log.info({ googleError: error }, 'Google sign-in cancelled');
    return failSignIn(res, 'cancelled');
  }

  try {
    if (!flow) throw new GoogleAuthError('missing_flow_cookie');
    if (typeof state !== 'string' || !safeEqual(state, flow.state)) {
      throw new GoogleAuthError('state_mismatch');
    }
    if (typeof code !== 'string' || code === '') throw new GoogleAuthError('missing_code');

    const idToken = await getGoogleTokenClient().exchangeCode(config, {
      code,
      codeVerifier: flow.codeVerifier,
      redirectUri: redirectUri(),
    });
    const profile = profileFromIdToken(idToken, { clientId: config.clientId, nonce: flow.nonce });
    const { user, sessionToken, isNewUser } = await signInWithGoogle(profile, flow.timezone);

    req.log.info({ userId: user.id, isNewUser }, 'Google sign-in succeeded');
    setSessionCookie(res, sessionToken);
    res.redirect(303, `${env.appUrl}/`);
  } catch (err) {
    // The user is mid-navigation, so always land them back on a page rather than raw JSON
    if (err instanceof GoogleAuthError) {
      req.log.warn({ reason: err.reason }, 'Google sign-in refused');
    } else {
      req.log.error({ err }, 'Google sign-in failed unexpectedly');
    }
    failSignIn(res, 'failed');
  }
};
