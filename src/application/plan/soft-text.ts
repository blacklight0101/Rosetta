import { z } from 'zod';

// P5-24, P3-126, RF-601: the optional `alternative` and `invariant` of a security control. A small
// model sends a null, a list of strings, an object or a number where the prompt asks for a sentence,
// or a text past the bound. Each has a safe reading: nothing, or nothing readable, is none; a list
// or an object is its texts joined; a text past the bound is cut with a marker. The control is never
// lost over these fields.

const CUT_MARKER = ' [cut]';

function readText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const parts: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null
      ? Object.values(value)
      : [];
  return parts
    .flatMap((each) =>
      typeof each === 'string' || typeof each === 'number' ? [readText(each)] : [],
    )
    .filter((each) => each !== '')
    .join(' ');
}

/** A text of at most `max` characters, read from any shape; a missing key reads as none. */
export function softText(max: number): z.ZodType<string> {
  return z
    .unknown()
    .optional()
    .transform((value) => {
      const read = readText(value);
      return read.length <= max
        ? read
        : `${read.slice(0, max - CUT_MARKER.length).trimEnd()}${CUT_MARKER}`;
    });
}
