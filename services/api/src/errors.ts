import { z } from 'zod';
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'VALIDATION_ERROR', result.error.issues.map(i => `${i.path.join('.') || 'request'}: ${i.message}`).join('; '));
  return result.data;
}
