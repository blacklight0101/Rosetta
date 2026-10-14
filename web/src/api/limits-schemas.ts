import { z } from 'zod';

// RF-1001, RF-1106, DEC-107, DEC-108: the wire shape of `GET /api/account/limits` (limit-routes.ts):
// what is left of the user's day and the server's month on the server's keys, and of the user's own
// daily cap on their own keys. Amounts are decimal strings of micro-dollars, read into bigints so
// nothing is rounded; what is left is never below zero.

const micros = z
  .string()
  .regex(/^\d{1,18}$/u)
  .transform((text) => BigInt(text));

const amounts = z.object({
  capMicros: micros,
  spentMicros: micros,
  remainingMicros: micros,
});

export const limitsSchema = z.object({
  serverKeys: z.object({
    userDay: amounts,
    serverMonth: z.object({ remainingMicros: micros }),
  }),
  ownKeys: z.object({ day: amounts.nullable() }),
});

export type SpendLimits = z.output<typeof limitsSchema>;
