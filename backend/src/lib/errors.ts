export interface ErrorDetail {
  path: string;
  message: string;
}

// An error we throw on purpose. The error handler sends its status, code and message to the
// client; anything else is treated as an unexpected failure and hidden behind a generic 500.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Not authenticated');

export const notFound = (resource: string) =>
  new AppError(404, 'NOT_FOUND', `${resource} not found`);

export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

export const businessRule = (code: string, message: string) => new AppError(422, code, message);
