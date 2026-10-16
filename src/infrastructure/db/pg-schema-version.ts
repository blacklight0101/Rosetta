import type { RecordedMigration } from './migration-plan.js';
import type { DatabasePool } from './pool.js';

/** Not implemented yet (P1-158 red step). */
export class PgSchemaVersion {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  recorded(): Promise<readonly RecordedMigration[] | undefined> {
    return Promise.resolve(this.pool.totalCount < 0 ? undefined : []);
  }

  connectsAsOwner(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
