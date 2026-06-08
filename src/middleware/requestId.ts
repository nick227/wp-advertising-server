import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startedAt: number;
    }
  }
}

const SAFE_REQUEST_ID = /^[\w\-]{1,128}$/;

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : `req_${randomUUID()}`;
  req.requestId = requestId;
  req.startedAt = Date.now();
  res.setHeader('x-request-id', requestId);
  res.on('finish', () => {
    console.log(JSON.stringify({
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - req.startedAt,
    }));
  });
  next();
};
