// RNF-005, ADR-008: the loopback ports of the fake provider servers that the tests started. Under
// ROSETTA_TEST=1 the real-provider guard trusts a base URL only when its port is listed here, so
// no caller can vouch for a URL with a flag. Nothing outside the tests registers a port.

const fakeServerPorts = new Set<number>();

/** Called by a fake server once it listens on `port`. */
export function registerFakeServerPort(port: number): void {
  fakeServerPorts.add(port);
}

/** Called by a fake server when it stops. */
export function releaseFakeServerPort(port: number): void {
  fakeServerPorts.delete(port);
}

/** True when a fake server registered `port` and has not released it. */
export function isFakeServerPort(port: number): boolean {
  return fakeServerPorts.has(port);
}
