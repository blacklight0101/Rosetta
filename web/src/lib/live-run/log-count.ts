import type { LogLine } from './run-state.js';

// RF-1002: the count beside the Activity tab (stub, replaced by the fix).
export function logCountOf(log: readonly LogLine[]): number | string {
  return log.length;
}
