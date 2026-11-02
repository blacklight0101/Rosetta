import { z } from 'zod';

// Q-54, EV-01, EV-30, P7-14, P7-15: how one entry of a list of positions is read. A position is a
// number from 1 to 200, an object holding it (`{"position": 3}`, `{"index": 3}`) or a string of
// digits (`"12"`); anything else is no position (list-entries.ts decides what becomes of it).

export const MAX_ITEMS = 200;

export const position = z.number().int().min(1).max(MAX_ITEMS);

const digits = z
  .string()
  .regex(/^[0-9]+$/)
  .transform((text) => Number(text))
  .pipe(position);

const numberPosition = z.union([
  position,
  z.object({ position }).transform((each) => each.position),
  z.object({ index: position }).transform((each) => each.index),
]);

export const listedPosition = z.union([numberPosition, digits]);
