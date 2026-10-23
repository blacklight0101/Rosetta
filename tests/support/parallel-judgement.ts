import type { LlmProvider } from '../../src/application/ports/llm-provider.js';
import type { RepositoryReader } from '../../src/application/ports/repository-reader.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { budgetHarness, contractPrice, type BudgetHarness } from './budget-harness.js';
import { recordingOf } from './fake-recordings.js';
import { verifierHarness, type VerifierHarness } from './verifier-harness.js';

// P5-15: helpers for the tests of the verifier's parallel judgements: calls held back until the
// test lets them go, files that read slowly, and a verifier wired to a real budget guard.

/** Lets every pending promise callback run. */
export async function settle(rounds = 40): Promise<void> {
  for (let round = 0; round < rounds; round += 1) await Promise.resolve();
}

export interface Hold {
  readonly opened: Promise<void>;
  open(): void;
}

export function hold(): Hold {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

export interface HeldProvider {
  readonly provider: LlmProvider;
  readonly holds: Hold[];
  readonly state: { peak: number };
}

/** A provider that answers like `inner` but keeps each answer back until the test lets it go. */
export function heldProvider(inner: LlmProvider): HeldProvider {
  const holds: Hold[] = [];
  let active = 0;
  const state = { peak: 0 };
  const provider: LlmProvider = {
    complete: async (request, observer) => {
      const mine = hold();
      holds.push(mine);
      active += 1;
      state.peak = Math.max(state.peak, active);
      try {
        const answer = await inner.complete(request, observer);
        await mine.opened;
        return answer;
      } finally {
        active -= 1;
      }
    },
  };
  return { provider, holds, state };
}

/** A reader that makes each file read take as many ticks as `delays` says for `path:startLine`. */
export function slowReader(
  reader: RepositoryReader,
  delays: ReadonlyMap<string, number>,
): Pick<RepositoryReader, 'readLines'> {
  return {
    readLines: async (range: Parameters<RepositoryReader['readLines']>[0]) => {
      await settle(delays.get(`${range.path}:${String(range.startLine)}`) ?? 0);
      return reader.readLines(range);
    },
  };
}

export const judgeModelTable = {
  version: 't',
  currency: 'USD',
  prices: [{ ...contractPrice, model: 'judge-model' }],
} as const;

export interface BudgetedVerifier {
  readonly verifier: VerifierHarness;
  readonly budget: BudgetHarness;
}

/** A verifier whose provider is a budget guard (memory ledger) around the fake of `recording`. */
export async function budgetedVerifier(
  limit: bigint,
  recording: Recording = recordingOf(),
): Promise<BudgetedVerifier> {
  const link: { guard?: LlmProvider } = {};
  const verifier = await verifierHarness({
    recording: recordingOf(),
    provider: () => ({
      complete: (request, observer) => {
        if (link.guard === undefined) throw new Error('The guard is not wired.');
        return link.guard.complete(request, observer);
      },
    }),
  });
  const budget = budgetHarness({
    table: judgeModelTable,
    recording,
    caps: [{ kind: 'run-cost', limit }],
    stopRun: (reason) => {
      verifier.abort(reason);
    },
  });
  link.guard = budget.guard;
  return { verifier, budget };
}
