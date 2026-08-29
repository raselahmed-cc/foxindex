import { type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ValidationError } from '../errors/app-error';

/**
 * Validates a request body/query/param against a Zod schema — the single
 * validation mechanism across FoxIndex (constitution: "Validation: Zod"). No
 * class-validator/class-transformer: DTOs are plain Zod-inferred types, and this
 * pipe is the only place a Zod schema needs to touch NestJS.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError(
        'Request validation failed',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
