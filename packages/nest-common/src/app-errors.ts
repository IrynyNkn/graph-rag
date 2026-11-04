/** Application errors say what went wrong. `AppErrorFilter` decides what that means over HTTP. */
export class AppError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {}

export class ConflictError extends AppError {}

export class InvalidInputError extends AppError {}

export class UnsupportedMediaError extends AppError {}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
