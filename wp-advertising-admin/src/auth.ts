import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';

const COOKIE = 'wpa_admin_session';

export function signToken(token: string): string {
  const sig = createHmac('sha256', config.sessionSecret).update(token).digest('base64url');
  return `${Buffer.from(token).toString('base64url')}.${sig}`;
}

export function readSessionToken(req: Request): string | undefined {
  const raw = req.cookies?.[COOKIE];
  if (!raw || typeof raw !== 'string') return undefined;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return undefined;
  const token = Buffer.from(payload, 'base64url').toString('utf8');
  const expected = createHmac('sha256', config.sessionSecret).update(token).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  return token;
}

export function setSession(res: Response, token: string) {
  res.cookie(COOKIE, signToken(token), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function requireSession(req: Request, res: Response, next: NextFunction) {
  const token = readSessionToken(req);
  if (!token) {
    res.redirect('/login');
    return;
  }
  req.adminToken = token;
  next();
}

declare global {
  namespace Express {
    interface Request {
      adminToken?: string;
    }
  }
}
