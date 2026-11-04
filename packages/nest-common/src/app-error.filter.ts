import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import {
  AppError,
  ConflictError,
  InvalidInputError,
  NotFoundError,
  UnsupportedMediaError,
} from './app-errors.js';

const STATUS_BY_ERROR = new Map<new (...args: never[]) => AppError, HttpStatus>([
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ConflictError, HttpStatus.CONFLICT],
  [InvalidInputError, HttpStatus.BAD_REQUEST],
  [UnsupportedMediaError, HttpStatus.UNSUPPORTED_MEDIA_TYPE],
]);

@Catch(AppError)
export class AppErrorFilter implements ExceptionFilter<AppError> {
  catch(error: AppError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = statusOf(error);
    response.status(status).json({ statusCode: status, message: error.message });
  }
}

function statusOf(error: AppError): HttpStatus {
  for (const [errorClass, status] of STATUS_BY_ERROR) {
    if (error instanceof errorClass) {
      return status;
    }
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}
