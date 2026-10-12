import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { isFakeServerPort } from './fake-server-ports.js';

// RNF-005, ADR-008: under ROSETTA_TEST=1 an adapter calls only a loopback fake server that a test
// started and whose port it registered; every other call is refused before it leaves the process.

export interface RealProviderGuard {
  /** `ROSETTA_TEST=1`. */
  readonly testMode: boolean;
  readonly baseUrl: string;
}

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

function isRegisteredFake(baseUrl: string): boolean {
  const url = new URL(baseUrl);
  return loopbackHosts.has(url.hostname) && url.port !== '' && isFakeServerPort(Number(url.port));
}

/** Throws RST-1509 when a test would call a real provider. */
export function refuseRealProviderInTests(guard: RealProviderGuard): void {
  if (!guard.testMode) return;
  if (isRegisteredFake(guard.baseUrl)) return;
  throw new RosettaError(ERROR_CODES.realProviderRefusedInTests);
}
