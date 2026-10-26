export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'ERROR',
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found.`, 'NOT_FOUND');
export const forbidden = (message = 'You do not have access to this action.') =>
  new HttpError(403, message, 'FORBIDDEN');
export const badRequest = (message: string) => new HttpError(400, message, 'BAD_REQUEST');
