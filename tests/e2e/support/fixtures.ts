import { expect, test as base } from '@playwright/test';
import { acquireCapsLock, capsLockFolder, capsTag } from './caps-lock.js';
import { clientAddressFor } from './client-address.js';
import { isAllowedRequestUrl } from './request-policy.js';

// RNF-005, ADR-008: the test every spec imports. Besides Playwright's own fixtures it adds the
// network guard: a request the policy refuses is aborted, recorded, and fails the test unless the
// test took it with `network.takeBlocked()` to assert on it.

export { expect };

/** The requests the guard refused in one test. */
export class NetworkGuard {
  private readonly blocked: string[] = [];

  record(url: string): void {
    this.blocked.push(url);
  }

  /** Returns the refused URLs and forgets them, so the test no longer fails for them. */
  takeBlocked(): string[] {
    return this.blocked.splice(0);
  }
}

export const test = base.extend<{
  network: NetworkGuard;
  clientAddress: string;
  capsTurn: boolean;
}>({
  // RF-1106, P1-131: a test tagged @caps writes the server-wide caps, so it waits for its turn
  // (caps-lock.ts) and keeps it until it ends. The wait is added to the time the test may take.
  capsTurn: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the first argument of a fixture to be a destructuring pattern, and this one needs no other fixture.
    async ({}, use, testInfo) => {
      if (!testInfo.tags.includes(capsTag)) {
        await use(false);
        return;
      }
      const turn = await acquireCapsLock(capsLockFolder());
      testInfo.setTimeout(testInfo.timeout + turn.waitedMs);
      try {
        await use(true);
      } finally {
        await turn.release();
      }
    },
    { auto: true, timeout: 900_000 },
  ],
  // Every test browses from an address of its own (see serve.ts, ROSETTA_TRUST_PROXY), so the
  // per-address rate limits of sign-in and password change count that test only.
  clientAddress: [
    async ({ context }, use, testInfo) => {
      const address = clientAddressFor(`${testInfo.project.name}:${testInfo.testId}`);
      await context.setExtraHTTPHeaders({ 'x-forwarded-for': address });
      await use(address);
    },
    { auto: true },
  ],
  network: [
    async ({ context }, use) => {
      const guard = new NetworkGuard();
      await context.route('**/*', (route) => {
        const url = route.request().url();
        if (isAllowedRequestUrl(url)) return route.fallback();
        guard.record(url);
        return route.abort('blockedbyclient');
      });
      // A WebSocket is not an HTTP request to the route above: the same policy decides.
      await context.routeWebSocket(/.*/u, (socket) => {
        const url = socket.url();
        if (isAllowedRequestUrl(url)) {
          socket.connectToServer();
          return;
        }
        guard.record(url);
        void socket.close();
      });
      await use(guard);
      expect(guard.takeBlocked(), 'RNF-005: requests outside 127.0.0.1 are blocked').toEqual([]);
    },
    { auto: true },
  ],
});
