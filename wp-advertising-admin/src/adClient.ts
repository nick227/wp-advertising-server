import { config } from './config.js';

export class AdServerError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`Ad server responded ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function adFetch<T = unknown>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${config.adServerBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) as unknown : null;
  if (!res.ok) throw new AdServerError(res.status, body);
  return body as T;
}
