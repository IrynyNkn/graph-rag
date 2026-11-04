import { BadRequestException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppErrorFilter } from './app-error.filter.js';
import {
  AppError,
  ConflictError,
  errorMessage,
  InvalidInputError,
  NotFoundError,
  UnsupportedMediaError,
} from './app-errors.js';
import { HealthController } from './health.controller.js';
import { parseEnv } from './parse-env.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('parseEnv', () => {
  const schema = z.object({ PORT: z.coerce.number(), NAME: z.string().default('x') });

  it('coerces and applies defaults', () => {
    expect(parseEnv(schema, { PORT: '3000' })).toEqual({ PORT: 3000, NAME: 'x' });
  });

  it('names the invalid variable', () => {
    expect(() => parseEnv(schema, {})).toThrow(/Invalid environment[\s\S]*PORT/);
  });
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ content: z.string().min(1) }));

  it('returns the parsed value', () => {
    expect(pipe.transform({ content: 'a', extra: 1 })).toEqual({ content: 'a' });
  });

  it('answers bad requests for invalid input', () => {
    expect(() => pipe.transform({ content: '' })).toThrow(BadRequestException);
  });
});

describe('AppErrorFilter', () => {
  class SpecificNotFound extends NotFoundError {}

  function statusFor(error: AppError): { status: number; body: unknown } {
    const result = { status: 0, body: null as unknown };
    const response = {
      status(code: number) {
        result.status = code;
        return this;
      },
      json(body: unknown) {
        result.body = body;
      },
    };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    new AppErrorFilter().catch(error, host as unknown as ArgumentsHost);
    return result;
  }

  it.each([
    [new NotFoundError('x'), HttpStatus.NOT_FOUND],
    [new SpecificNotFound('x'), HttpStatus.NOT_FOUND],
    [new ConflictError('x'), HttpStatus.CONFLICT],
    [new InvalidInputError('x'), HttpStatus.BAD_REQUEST],
    [new UnsupportedMediaError('x'), HttpStatus.UNSUPPORTED_MEDIA_TYPE],
    [new AppError('x'), HttpStatus.INTERNAL_SERVER_ERROR],
  ])('maps %s', (error, status) => {
    expect(statusFor(error).status).toBe(status);
  });

  it('sends the message of the error', () => {
    expect(statusFor(new NotFoundError('It is gone')).body).toEqual({
      statusCode: 404,
      message: 'It is gone',
    });
  });

  it('names errors after their class', () => {
    expect(new SpecificNotFound('x').name).toBe('SpecificNotFound');
  });
});

describe('errorMessage', () => {
  it('reads errors and anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain')).toBe('plain');
  });
});

describe('HealthController', () => {
  it('reports ok', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
});
