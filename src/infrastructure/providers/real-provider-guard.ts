import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RNF-005, ADR-008: under ROSETTA_TEST=1 an adapter calls only a loopback fake server that a test
// started; every other call is refused before it leaves the process.

export interface RealProviderGuard {
  /** `ROSETTA_TEST=1`. */
  readonly testMode: boolean;
  /** True only in tests whose base URL is a loopback fake server they started. */
  readonly fakeServer?: boolean | undefined;
  readonly baseUrl: string;
}

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Throws RST-1509 when a test would call a real provider. */
export function refuseRealProviderInTests(guard: RealProviderGuard): void {
  if (!guard.testMode) return;
  const host = new URL(guard.baseUrl).hostname;
  if (guard.fakeServer === true && loopbackHosts.has(host)) return;
  throw new RosettaError(ERROR_CODES.realProviderRefusedInTests);
}
