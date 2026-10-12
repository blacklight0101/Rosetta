import { expect, test as base } from '@playwright/test';
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

export const test = base.extend<{ network: NetworkGuard }>({
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
