import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../lib/errors.js';

// Every error response has the same shape: { error: { code, message, details? } }.
// Express 5 forwards rejected promises here, so controllers can simply throw.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: details[0]?.message ?? 'Invalid input', details },
    });
    return;
  }

  // Malformed JSON body (thrown by express.json)
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } });
    return;
  }

  // Unexpected: log the details, hide them from the client
  req.log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};
