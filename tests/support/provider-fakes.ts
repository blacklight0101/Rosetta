import type {
  CostLedger,
  LedgerEntry,
  ReservationRequest,
} from '../../src/application/ports/cost-ledger.js';
import type { CapBreach } from '../../src/domain/budget/usage-cap.js';
import type { Result } from '../../src/domain/errors/result.js';
import { FakeProvider } from '../../src/infrastructure/providers/fake/fake-provider.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import type {
  AdapterBuilder,
  AdapterSpec,
} from '../../src/infrastructure/providers/adapter-spec.js';
import { contractScenarios } from '../contracts/llm-provider.contract.js';
import { recordingOf } from './fake-recordings.js';

// RF-405, RF-407: the fakes behind the provider factory in tests: a ledger that keeps what passed
// through it, and an adapter builder that hands out a FakeProvider per spec.

/** Wraps a ledger and keeps what passed through it. */
export class SpyLedger implements CostLedger {
  readonly reservations: ReservationRequest[] = [];
  readonly entries: LedgerEntry[] = [];
  readonly released: string[] = [];
  private readonly inner: CostLedger;

  constructor(inner: CostLedger) {
    this.inner = inner;
  }

  reserve(request: ReservationRequest): Promise<Result<void, CapBreach>> {
    this.reservations.push(request);
    return this.inner.reserve(request);
  }

  settle(entry: LedgerEntry): Promise<void> {
    this.entries.push(entry);
    return this.inner.settle(entry);
  }

  release(callId: string): Promise<void> {
    this.released.push(callId);
    return this.inner.release(callId);
  }

  runEntries(userId: string, runId: string): Promise<readonly LedgerEntry[]> {
    return this.inner.runEntries(userId, runId);
  }

  purgeExpired(at: Date): Promise<number> {
    return this.inner.purgeExpired(at);
  }
}

const answersManyTimes = (): Recording =>
  recordingOf(...Array.from({ length: 6 }, () => contractScenarios.text));

export interface FakeAdapters {
  readonly builder: AdapterBuilder;
  /** The specs the builder was asked for, in order. */
  readonly built: AdapterSpec[];
  /** The latest fake of each provider name. */
  readonly fakes: Map<string, FakeProvider>;
  /** Every fake handed out, in the order of `built`. */
  readonly fakeList: FakeProvider[];
}

/** An adapter builder that hands out a FakeProvider per spec, replaying the recording of its name. */
export function fakeAdapters(recordings: Readonly<Record<string, Recording>> = {}): FakeAdapters {
  const built: AdapterSpec[] = [];
  const fakes = new Map<string, FakeProvider>();
  const fakeList: FakeProvider[] = [];
  const builder: AdapterBuilder = (spec) => {
    built.push(spec);
    const fake = new FakeProvider({
      testMode: true,
      recording: recordings[spec.name] ?? answersManyTimes(),
    });
    fakes.set(spec.name, fake);
    fakeList.push(fake);
    return fake;
  };
  return { builder, built, fakes, fakeList };
}
