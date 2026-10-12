import type {
  CostLedger,
  LedgerEntry,
  ReservationRequest,
} from '../../application/ports/cost-ledger.js';
import { checkCaps, type CapBreach } from '../../domain/budget/usage-cap.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  DELETE_EXPIRED,
  DELETE_RESERVATION,
  entryValues,
  INSERT_ENTRY,
  INSERT_RESERVATION,
  LOCK_SERVER,
  LOCK_USER,
  reservationValues,
  RUN_ENTRIES,
  SPENT,
  spentValues,
  toLedgerEntry,
  toSpent,
} from './cost-ledger-rows.js';
import type { DatabaseClient, DatabasePool } from './pool.js';

// Architecture section 7, ADR-016, RF-428, RF-1106, DEC-112: the cost ledger in PostgreSQL. A
// reservation takes `pg_advisory_xact_lock` on the user and, for a server key, on the server, then
// sums the ledger and the unexpired reservations and inserts the reservation in the same
// transaction; the locks are released at commit, before the call is made. Every reservation of a
// user takes the user lock and every server-key reservation the server lock, always in that
// order, so two checks that share a cap run one after the other and cannot both pass its last
// cent, and no two transactions wait on each other in a cycle. Settling inserts the ledger row and
// deletes the reservation in one transaction, so a concurrent check sees one or the other.

function queryFailed(error: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
}

export class PgCostLedger implements CostLedger {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  reserve(request: ReservationRequest): Promise<Result<void, CapBreach>> {
    const { reservation, caps, at } = request;
    return this.transaction(async (client) => {
      await client.query(LOCK_USER, [reservation.userId]);
      if (reservation.keySource === 'server') await client.query(LOCK_SERVER);
      const spent = await client.query<Record<string, unknown>>(
        SPENT,
        spentValues(reservation, at),
      );
      const checked = checkCaps(caps, toSpent(spent.rows[0]), reservation.worstCase);
      if (checked.ok) await client.query(INSERT_RESERVATION, reservationValues(reservation));
      return checked;
    });
  }

  settle(entry: LedgerEntry): Promise<void> {
    return this.transaction(async (client) => {
      await client.query(INSERT_ENTRY, entryValues(entry));
      await client.query(DELETE_RESERVATION, [entry.callId]);
    });
  }

  async release(callId: string): Promise<void> {
    try {
      await this.pool.query(DELETE_RESERVATION, [callId]);
    } catch (error) {
      throw queryFailed(error);
    }
  }

  async runEntries(userId: string, runId: string): Promise<readonly LedgerEntry[]> {
    try {
      const result = await this.pool.query<Record<string, unknown>>(RUN_ENTRIES, [userId, runId]);
      return result.rows.map(toLedgerEntry);
    } catch (error) {
      throw queryFailed(error);
    }
  }

  async purgeExpired(at: Date): Promise<number> {
    try {
      return (await this.pool.query(DELETE_EXPIRED, [at])).rowCount ?? 0;
    } catch (error) {
      throw queryFailed(error);
    }
  }

  private async transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
    let client: DatabaseClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw queryFailed(error);
    }
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw queryFailed(error);
    } finally {
      client.release();
    }
  }
}
