import { fakeServerPorts } from '../../src/infrastructure/providers/fake-server-port-registry.js';

// RNF-005, ADR-008: the only way to make the real-provider guard trust a loopback port. It lives
// in tests/support so that production code cannot import it (src-not-tests, and the rule
// fake-server-registry-test-only on the registry itself).

/** Called by a fake server once it listens on `port`. */
export function registerFakeServerPort(port: number): void {
  fakeServerPorts.add(port);
}

/** Called by a fake server when it stops. */
export function releaseFakeServerPort(port: number): void {
  fakeServerPorts.delete(port);
}
