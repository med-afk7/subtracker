import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Defence in depth against CSRF on top of SameSite=Lax cookies (docs §5.3):
// 1. Browsers send an Origin header with cross-site requests; reject any that isn't our app.
//    Requests without one (curl, server-to-server) can't carry a victim's cookies.
// 2. Require JSON bodies. Plain HTML forms can only send form-encoded or text bodies.
export const originCheck: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  if (origin && origin !== env.appOrigin) {
    throw new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin not allowed');
  }

  const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding');
  if (hasBody && !req.is('application/json')) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request body must be JSON');
  }

  next();
};
