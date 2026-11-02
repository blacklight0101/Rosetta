import { dollarsToMicros } from '../lib/usd.js';

// RF-002, DEC-116, DEC-117: the settings form reads its text fields with this reader, which names
// only text that is not a number at all; the server judges every range.

/** A field whose text is not a number; the path is the one the server uses for that field. */
export interface LocalProblem {
  readonly field: string;
  readonly message: string;
}

const notWhole = 'Enter a whole number, for example 4096.';
const notDollars = 'Enter an amount in dollars, for example 2.50.';

/** Reads the fields one by one and remembers the ones that are not numbers. */
export class FieldReader {
  readonly problems: LocalProblem[] = [];

  /** A whole number; zero (and a problem) when the text is not one. */
  whole(field: string, text: string): number {
    const trimmed = text.trim();
    const value = /^-?\d+$/u.test(trimmed) ? Number(trimmed) : Number.NaN;
    if (Number.isSafeInteger(value)) return value;
    this.problems.push({ field, message: notWhole });
    return 0;
  }

  /** A whole number or nothing: an empty field is left out of the document. */
  optionalWhole(field: string, text: string): number | undefined {
    return text.trim() === '' ? undefined : this.whole(field, text);
  }

  /** Dollars as micro-dollars; zero (and a problem) when the text is not an amount that fits. */
  micros(field: string, text: string, maxMicros?: bigint): number {
    const value = Number(dollarsToMicros(text, maxMicros) ?? Number.NaN);
    if (Number.isSafeInteger(value)) return value;
    this.problems.push({ field, message: notDollars });
    return 0;
  }
}
