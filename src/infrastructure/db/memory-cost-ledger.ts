import type {
  CostLedger,
  LedgerEntry,
  Reservation,
  ReservationRequest,
} from '../../application/ports/cost-ledger.js';
import type { KeySource } from '../../domain/budget/price-table.js';
import { checkCaps, type CapBreach, type CapSpent } from '../../domain/budget/usage-cap.js';
import { utcPeriodsOf } from '../../domain/budget/utc-periods.js';
import type { Result } from '../../domain/errors/result.js';

// Architecture section 7: the cost ledger in memory, for unit tests. Passes the same contract as
// PgCostLedger. `reserve` sums, checks and stores without awaiting in between, so in one process
// it is one step, as the advisory locks make it one step in PostgreSQL.

function sum(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

const tokensOf = (entry: LedgerEntry): bigint =>
  BigInt(entry.inputTokens) + BigInt(entry.outputTokens);

export class MemoryCostLedger implements CostLedger {
  private readonly entries: LedgerEntry[] = [];
  private readonly reservations = new Map<string, Reservation>();

  reserve(request: ReservationRequest): Promise<Result<void, CapBreach>> {
    const { reservation, caps, at } = request;
    const checked = checkCaps(caps, this.spent(reservation, at), reservation.worstCase);
    if (checked.ok) this.reservations.set(reservation.callId, reservation);
    return Promise.resolve(checked);
  }

  settle(entry: LedgerEntry): Promise<void> {
    this.entries.push(entry);
    this.reservations.delete(entry.callId);
    return Promise.resolve();
  }

  release(callId: string): Promise<void> {
    this.reservations.delete(callId);
    return Promise.resolve();
  }

  runEntries(userId: string, runId: string): Promise<readonly LedgerEntry[]> {
    return Promise.resolve(
      this.entries.filter((entry) => entry.userId === userId && entry.runId === runId),
    );
  }

  purgeExpired(at: Date): Promise<number> {
    const expired = [...this.reservations.values()].filter((held) => !this.counts(held, at));
    for (const held of expired) this.reservations.delete(held.callId);
    return Promise.resolve(expired.length);
  }

  private counts(held: Reservation, at: Date): boolean {
    return held.expiresAt.getTime() > at.getTime();
  }

  private spent(call: Reservation, at: Date): CapSpent {
    const { dayStart, dayEnd, monthStart, monthEnd } = utcPeriodsOf(at);
    const held = [...this.reservations.values()].filter((each) => this.counts(each, at));
    const within = (entry: LedgerEntry, start: number, end: number): boolean =>
      entry.at.getTime() >= start && entry.at.getTime() < end;
    const mine = (source: KeySource) => (entry: LedgerEntry | Reservation) =>
      entry.userId === call.userId && entry.keySource === source;
    const ofRun = (entry: LedgerEntry | Reservation): boolean => entry.runId === call.runId;
    const server = (entry: LedgerEntry | Reservation): boolean => entry.keySource === 'server';
    const day = (source: KeySource): bigint =>
      sum(
        this.entries
          .filter((e) => mine(source)(e) && within(e, dayStart, dayEnd))
          .map((e) => e.costMicros),
      ) + sum(held.filter(mine(source)).map((r) => r.worstCase.micros));
    return {
      'run-cost': sum([
        ...this.entries.filter(ofRun).map((e) => e.costMicros),
        ...held.filter(ofRun).map((r) => r.worstCase.micros),
      ]),
      'run-tokens': sum([
        ...this.entries.filter(ofRun).map(tokensOf),
        ...held.filter(ofRun).map((r) => r.worstCase.tokens),
      ]),
      'user-day': day('server'),
      'own-day': day('user'),
      'server-month': sum([
        ...this.entries
          .filter((e) => server(e) && within(e, monthStart, monthEnd))
          .map((e) => e.costMicros),
        ...held.filter(server).map((r) => r.worstCase.micros),
      ]),
    };
  }
}
