import type { DatabaseHealth } from '../../src/application/ports/database-health.js';

/** RF-1303: a database probe whose answer a test sets. */
export class FakeDatabaseHealth implements DatabaseHealth {
  reachable: boolean;

  constructor(reachable: boolean) {
    this.reachable = reachable;
  }

  isReachable(): Promise<boolean> {
    return Promise.resolve(this.reachable);
  }
}
