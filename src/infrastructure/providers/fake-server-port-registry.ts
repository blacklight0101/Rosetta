// RNF-005, ADR-008: the loopback ports of the fake provider servers that the tests started. Only
// tests/support writes to this set (tests/support/fake-server-registration.ts); the only module
// of src that may import this file is fake-server-ports.ts, which reads it (dependency-cruiser
// rule `fake-server-registry-test-only`). So no production code can vouch for a URL.

export const fakeServerPorts = new Set<number>();
