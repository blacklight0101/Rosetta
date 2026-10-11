import type { DatabaseHealth } from '../../application/ports/database-health.js';
import type { DatabasePool } from './pool.js';

const PROBE = 'SELECT 1';
/** A health check that waits longer than this reports the database as unreachable. */
const PROBE_TIMEOUT_MS = 3_000;

/** What the probe needs of a pool, so a test can hand it one that never answers. */
type QueryablePool = Pick<DatabasePool, 'query'>;

// RF-1303: one trivial query on the app pool; a failure or a slow answer means "not reachable".
export class PgDatabaseHealth implements DatabaseHealth {
  private readonly pool: QueryablePool;

  constructor(pool: QueryablePool) {
    this.pool = pool;
  }

  async isReachable(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        resolve(false);
      }, PROBE_TIMEOUT_MS);
    });
    const probe = this.pool.query(PROBE).then(
      () => true,
      () => false,
    );
    try {
      return await Promise.race([probe, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
