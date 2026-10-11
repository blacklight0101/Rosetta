import type { LlmResponse } from '../../src/application/ports/llm-provider.js';
import type {
  Recording,
  RecordedAttempt,
} from '../../src/infrastructure/providers/fake/recording.js';
import type { ScenarioOutcome } from '../contracts/llm-provider.contract.js';

// ADR-008: recordings for the fake provider built in memory, so unit tests touch no disk. The
// recordings under tests/recordings/ use the same schema.

const fakeModelVersion = 'fake-model-2026-10-01';

/** A complete response with the fake's request id and model version. */
export function fakeResponse(
  response: Omit<LlmResponse, 'modelVersion'> & { readonly modelVersion?: string },
): LlmResponse {
  return { requestId: 'fake-request-1', modelVersion: fakeModelVersion, ...response };
}

/** The attempts of one call that ends as `outcome` describes. */
function attemptsOf(outcome: ScenarioOutcome): RecordedAttempt[] {
  const retried = outcome.retried.map((failure) => ({ failure }));
  const last: RecordedAttempt =
    outcome.response === undefined
      ? { failure: outcome.failure ?? { code: 'RST-1506' } }
      : { response: fakeResponse(outcome.response) };
  return [...retried, last];
}

/** A recording with one call per outcome, replayed in order. */
export function recordingOf(...outcomes: readonly ScenarioOutcome[]): Recording {
  return {
    schemaVersion: 1,
    description: 'built in memory by a test',
    calls: outcomes.map((outcome) => ({ attempts: attemptsOf(outcome) })),
  };
}
