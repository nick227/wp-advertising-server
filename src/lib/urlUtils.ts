import { z } from 'zod';
import { config } from '../config.js';

export const publicHttpUrlSchema = z.string().trim().max(1024).refine((value) => {
  try {
    const url = new URL(value);
    return isHttpUrl(url) && Boolean(url.hostname);
  } catch {
    return false;
  }
}, 'URL must be a valid http or https URL').refine((value) => {
  if (config.nodeEnv !== 'production' || !config.rejectPrivateUrlsInProduction) return true;
  return !isPrivateOrLocalUrl(value);
}, 'Private/local URLs are not allowed in production');

export function normalizeSiteUrl(value: string) {
  const url = parseHttpUrl(value);
  url.protocol = 'https:';
  url.hash = '';
  url.search = '';
  url.pathname = '/';
  url.hostname = normalizeDomain(url.hostname);
  url.port = '';
  return trimTrailingSlash(url.toString());
}

export function normalizeAdUrl(value: string) {
  const url = parseHttpUrl(value);
  url.hash = '';
  url.hostname = normalizeDomain(url.hostname);
  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) url.port = '';
  return url.toString();
}

export function normalizeDomain(value: string) {
  const hostname = value.trim().toLowerCase().replace(/\.+$/, '');
  return hostname.replace(/^www\./, '');
}

export function domainFromUrl(value: string) {
  return normalizeDomain(parseHttpUrl(value).hostname);
}

export function isPrivateOrLocalUrl(value: string) {
  try {
    const hostname = normalizeDomain(parseHttpUrl(value).hostname);
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return true;
    if (hostname === '::1' || hostname === '[::1]') return true;
    if (/^127\./.test(hostname) || hostname === '0.0.0.0') return true;
    if (/^10\./.test(hostname)) return true;
    if (/^192\.168\./.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
    if (/^169\.254\./.test(hostname)) return true;
    return false;
  } catch {
    return true;
  }
}

export function extractDomain(value?: string) {
  if (!value) return undefined;
  try {
    return domainFromUrl(value).slice(0, 255);
  } catch {
    return undefined;
  }
}

function parseHttpUrl(value: string) {
  const url = new URL(value.trim());
  if (!isHttpUrl(url) || !url.hostname) throw new Error('URL must be a valid http or https URL');
  return url;
}

function isHttpUrl(url: URL) {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}
