import type { Request, RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export const adminAuth: RequestHandler = (req, res, next) => {
  const token = readToken(req);
  const configured = Boolean(config.adminToken && config.adminToken !== 'change-me');

  if (!configured) {
    if (config.nodeEnv === 'production') {
      res.status(503).json({ error: { code: 'ADMIN_AUTH_NOT_CONFIGURED', message: 'Admin access is not configured', requestId: req.requestId } });
      return;
    }
    return next();
  }

  if (token && safeEqual(token, config.adminToken)) return next();

  res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin token required', requestId: req.requestId } });
};

function readToken(req: Request) {
  const header = req.get('authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return (req.get('x-admin-token') || '').trim();
}

function safeEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
