import type { LlmProvider, LlmResponse } from '../../src/application/ports/llm-provider.js';
import { microUsd } from '../../src/domain/budget/money.js';
import { SecretMasker, type TextMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FakeProvider } from '../../src/infrastructure/providers/fake/fake-provider.js';
import { MemoryProviderCallLog } from '../../src/infrastructure/providers/memory-provider-call-log.js';
import { ObservedProvider } from '../../src/infrastructure/providers/observed-provider.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import { contractScenarios } from '../contracts/llm-provider.contract.js';
import { fakeResponse, recordingOf } from './fake-recordings.js';
import { FixedClock } from './fixed-clock.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-408: an ObservedProvider around a fake, writing to a memory call log, on a fixed clock.

export const observedInstant = '2026-10-11T09:05:03.007Z';

export interface ObservedHarness {
  readonly provider: ObservedProvider;
  readonly log: MemoryProviderCallLog;
}

export interface ObservedHarnessOptions {
  /** The inner provider; by default a FakeProvider replaying `recording`. */
  readonly inner?: (clock: FixedClock) => LlmProvider;
  readonly recording?: Recording;
  readonly transcripts?: boolean;
  readonly masker?: TextMasker;
}

/** Every call costs 1234 micro-USD. */
export function observedHarness(options: ObservedHarnessOptions = {}): ObservedHarness {
  const clock = new FixedClock(observedInstant);
  const log = new MemoryProviderCallLog(options.masker ?? new SecretMasker());
  const recording = options.recording ?? recordingOf(contractScenarios.text);
  const provider = new ObservedProvider({
    inner: options.inner?.(clock) ?? new FakeProvider({ testMode: true, recording }),
    recorder: log,
    clock,
    ids: new SequenceIdGenerator(),
    target: { provider: 'local', kind: 'ollama', endpointHost: 'host.docker.internal' },
    priceCall: () => microUsd(1234n),
    transcripts: options.transcripts ?? true,
  });
  return { provider, log };
}

/** An inner provider that takes `ms` on the clock, then answers `response`. */
export function slowProvider(clock: FixedClock, ms: number, response: LlmResponse): LlmProvider {
  return {
    complete: () => {
      clock.advance(ms);
      return Promise.resolve(response);
    },
  };
}

/** The answer of the contract's text scenario, as the fake returns it. */
export const textAnswer: LlmResponse = fakeResponse({
  text: 'The Catalog area lists products from the database.',
  toolCalls: [],
  usage: { inputTokens: 1200, outputTokens: 80, cachedInputTokens: 1024, usageSource: 'reported' },
  finishReason: 'stop',
});
