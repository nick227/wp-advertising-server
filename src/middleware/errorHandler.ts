import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.requestId || 'unknown';

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, requestId } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        requestId,
        issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON', requestId } });
    return;
  }

  console.error({ requestId, error: err });
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId } });
};
