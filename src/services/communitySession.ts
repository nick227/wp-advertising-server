import { createHmac, timingSafeEqual, scryptSync, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from '../config.js';

const COOKIE_NAME = 'wpa_community_session';
const SESSION_DAYS = 30;

export type SessionPayload = {
  userId: string;
  exp: number;
};

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64url');
}

function sign(payloadB64: string): string {
  return createHmac('sha256', config.sessionSecret).update(payloadB64).digest('base64url');
}

export function createSessionToken(userId: string): string {
  const payload: SessionPayload = {
    userId,
    exp: Date.now() + SESSION_DAYS * 86400000,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.userId || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === COOKIE_NAME) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function setSessionCookie(res: Response, token: string) {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`,
  );
}

export function clearSessionCookie(res: Response) {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (next.length !== expected.length) return false;
  return timingSafeEqual(next, expected);
}

export { COOKIE_NAME };
