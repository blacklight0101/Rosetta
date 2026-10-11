import { describe, expect, it } from 'vitest';
import type { DatabaseHealth } from '../../src/application/ports/database-health.js';

export interface DatabaseHealthCases {
  /** A probe of a database that answers. */
  readonly up: () => Promise<DatabaseHealth>;
  /** A probe of a database that does not answer. */
  readonly down: () => Promise<DatabaseHealth>;
}

/** Contract of the DatabaseHealth port (RF-1303): every adapter and fake must pass it. */
export function databaseHealthContract(name: string, cases: DatabaseHealthCases): void {
  describe(`DatabaseHealth contract: ${name}`, () => {
    it('RF-1303 reports reachable when the database answers', async () => {
      const health = await cases.up();

      await expect(health.isReachable()).resolves.toBe(true);
    });

    it('RF-1303 reports unreachable, without throwing, when the database does not answer', async () => {
      const health = await cases.down();

      await expect(health.isReachable()).resolves.toBe(false);
    });
  });
}
