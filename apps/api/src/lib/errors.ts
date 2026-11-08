export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 429 | 502 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);
export const badRequest = (message: string) => new HttpError(400, 'bad_request', message);
export const tooMany = (message: string) => new HttpError(429, 'rate_limited', message);
