import { fakeServerPorts } from './fake-server-port-registry.js';

// RNF-005, ADR-008: under ROSETTA_TEST=1 the real-provider guard trusts a base URL only when its
// port was registered by a fake server a test started. This module only reads the registry.

/** True when a fake server registered `port` and has not released it. */
export function isFakeServerPort(port: number): boolean {
  return fakeServerPorts.has(port);
}
