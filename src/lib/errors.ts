export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFound(message = 'Not found') {
  return new HttpError(404, 'NOT_FOUND', message);
}

export function badRequest(message = 'Bad request') {
  return new HttpError(400, 'BAD_REQUEST', message);
}

export function forbidden(message = 'Forbidden') {
  return new HttpError(403, 'FORBIDDEN', message);
}

export function serviceUnavailable(code: string, message: string) {
  return new HttpError(503, code, message);
}
