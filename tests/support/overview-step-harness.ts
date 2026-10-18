import type { ConsolidationParts } from '../../src/application/consolidate/consolidate-cards.js';
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../src/application/ports/llm-provider.js';
import type { AreaStanding } from '../../src/domain/overview/standing.js';
import { RecordingLogger } from './recording-logger.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-264: the overview step over a provider that answers from a list, shared by its unit tests.

export function answer(text: string): LlmResponse {
  const usage = {
    inputTokens: 1,
    outputTokens: 1,
    cachedInputTokens: 0,
    usageSource: 'reported',
  } as const;
  return { text, toolCalls: [], usage, finishReason: 'stop', modelVersion: 'fake-1' };
}

export class Answers implements LlmProvider {
  readonly requests: LlmRequest[] = [];
  private readonly next: () => LlmResponse;

  constructor(next: () => LlmResponse) {
    this.next = next;
  }

  complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    try {
      return Promise.resolve(this.next());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error('failed'));
    }
  }
}

export interface StepParts {
  readonly parts: ConsolidationParts;
  readonly logger: RecordingLogger;
  readonly answers: string[];
}

export function partsOf(provider: LlmProvider, signal = new AbortController().signal): StepParts {
  const logger = new RecordingLogger();
  const answers: string[] = [];
  const parts: ConsolidationParts = {
    ...{ provider, logger, signal, ids: new SequenceIdGenerator(), batchTokens: 100_000 },
    role: { model: 'm-1', maxOutputTokens: 900, temperature: 0.2 },
    prompt: {
      name: 'summariser/overview.v1.md',
      version: 'v1',
      sha256: 'ab',
      text: 'Write the overview.',
    },
    ...{ runId: '20260101-000001-understand', traceId: 'a'.repeat(32) },
    nextCallId: () => '20260101-000001-understand#9',
    onAnswer: (response) => Promise.resolve(void answers.push(response.modelVersion)),
  };
  return { parts, logger, answers };
}

export const standing = (name: string, overrides: Partial<AreaStanding> = {}): AreaStanding => ({
  name,
  thirdParty: false,
  selected: true,
  ended: true,
  cards: 0,
  ...overrides,
});
