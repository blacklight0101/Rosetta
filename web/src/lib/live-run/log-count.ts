import { countText } from '../understanding/measure-text.js';
import type { LogLine } from './run-state.js';

// RF-1002: the count beside the Activity tab. The log keeps the newest `LOG_LIMIT` events, so a full
// log means older events were dropped and the count reads "1,000+" instead of a number that is
// not the count of the run.

/** The log keeps this many of the newest events; the sequence numbers show how many came before. */
export const LOG_LIMIT = 1000;

// RF-1002
export function logCountOf(log: readonly LogLine[]): number | string {
  return log.length >= LOG_LIMIT ? `${countText(LOG_LIMIT)}+` : log.length;
}
