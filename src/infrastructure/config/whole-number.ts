import { z } from 'zod';

/** A whole number written in digits only (no sign, point, exponent or space) within `minimum..maximum`. */
export function whole(minimum: number, maximum: number, message: string): z.ZodType<number> {
  return z
    .string({ error: 'is missing' })
    .regex(/^\d{1,9}$/, { error: message })
    .transform(Number)
    .refine((value) => value >= minimum && value <= maximum, { error: message });
}
