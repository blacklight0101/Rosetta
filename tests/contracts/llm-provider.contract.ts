import { describe, expect, it } from 'vitest';
import type {
  LlmAttemptFailure,
  LlmAttemptObserver,
  LlmCallContext,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  ToolDefinition,
} from '../../src/application/ports/llm-provider.js';
import { ERROR_CODES, ERROR_RANGES } from '../../src/domain/errors/codes.js';
import { RosettaError } from '../../src/domain/errors/rosetta-error.js';
import { failureOf } from '../support/failure-of.js';

// RF-400, ADR-003, ADR-008: every LlmProvider (each adapter, the fake and every decorator) passes
// this suite. An adapter test arranges its recordings so that each scenario below answers with the
// normalised values of `contractScenarios`.

export type ContractScenario = 'text' | 'tool-call' | 'retry-then-text' | 'permanent-failure';

export interface ScenarioOutcome {
  /** The answer the scenario ends with; absent when the call fails for good. */
  readonly response?: Omit<LlmResponse, 'requestId' | 'modelVersion' | 'metrics'>;
  /** The attempts that fail before the last one (RF-406). */
  readonly retried: readonly LlmAttemptFailure[];
  /** The failure of the last attempt, when the call fails for good. */
  readonly failure?: LlmAttemptFailure;
}

const textAnswer: ScenarioOutcome['response'] = {
  text: 'The Catalog area lists products from the database.',
  toolCalls: [],
  usage: { inputTokens: 1200, outputTokens: 80, cachedInputTokens: 1024, usageSource: 'reported' },
  finishReason: 'stop',
};

/** The normalised values each scenario must produce. */
export const contractScenarios: Readonly<Record<ContractScenario, ScenarioOutcome>> = {
  text: { response: textAnswer, retried: [] },
  'tool-call': {
    response: {
      text: '',
      toolCalls: [
        {
          id: 'call-1',
          name: 'read_file',
          arguments: { path: 'src/Catalog.cs', startLine: 1, endLine: 40 },
        },
      ],
      usage: { inputTokens: 900, outputTokens: 30, cachedInputTokens: 0, usageSource: 'reported' },
      finishReason: 'tool_use',
    },
    retried: [],
  },
  'retry-then-text': {
    response: textAnswer,
    retried: [{ code: ERROR_CODES.providerRateLimited, httpStatus: 429 }],
  },
  'permanent-failure': {
    retried: [],
    failure: { code: ERROR_CODES.providerCallFailed, httpStatus: 401 },
  },
};

/** Creates the implementation under test, arranged to answer `scenario`. */
export type LlmProviderFactory = (scenario: ContractScenario) => Promise<LlmProvider>;

const context: LlmCallContext = {
  runId: '20261011-090503-understand',
  agentTaskId: 'task-1',
  role: 'reader',
  callId: '20261011-090503-understand#1',
  traceId: '0123456789abcdef0123456789abcdef',
  parentSpanId: '0123456789abcdef',
};

const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Reads a line range of a file.',
  parameters: { type: 'object', properties: { path: { type: 'string' } } },
};

/** The request every scenario sends. */
export function contractRequest(signal: AbortSignal = new AbortController().signal): LlmRequest {
  return {
    context,
    model: 'contract-model',
    system: 'You describe one area of a legacy codebase.',
    messages: [{ role: 'user', content: 'Describe the Catalog area.' }],
    tools: [readFileTool],
    maxOutputTokens: 512,
    signal,
  };
}

class RecordingObserver implements LlmAttemptObserver {
  started = 0;
  readonly retried: LlmAttemptFailure[] = [];

  attemptStarted(): void {
    this.started += 1;
  }

  attemptRetried(failure: LlmAttemptFailure): Promise<void> {
    this.retried.push(failure);
    return Promise.resolve();
  }
}

function isProviderCode(code: string): boolean {
  const value = Number(code.slice('RST-'.length));
  return value >= ERROR_RANGES.providers.first && value <= ERROR_RANGES.providers.last;
}

function answerTests(create: LlmProviderFactory): void {
  it('RF-400 returns text, usage with cached input tokens and the finish reason', async () => {
    const provider = await create('text');

    const response = await provider.complete(contractRequest());

    expect(response).toMatchObject(contractScenarios.text.response ?? {});
  });

  it('RF-400 returns tool calls with their arguments in the same shape', async () => {
    const provider = await create('tool-call');

    const response = await provider.complete(contractRequest());

    expect(response).toMatchObject(contractScenarios['tool-call'].response ?? {});
  });

  it('RF-400 reports the exact model version and the request id as text', async () => {
    const provider = await create('text');

    const response = await provider.complete(contractRequest());

    expect(response.modelVersion).toMatch(/\S/);
    expect(response.requestId ?? 'none').toMatch(/\S/);
  });
}

function attemptTests(create: LlmProviderFactory): void {
  it('RF-406 tells the observer about each retried attempt before the answer', async () => {
    const provider = await create('retry-then-text');
    const observer = new RecordingObserver();

    const response = await provider.complete(contractRequest(), observer);

    expect(response).toMatchObject(contractScenarios['retry-then-text'].response ?? {});
    expect(observer.retried).toEqual(contractScenarios['retry-then-text'].retried);
    expect(observer.started).toBe(2);
  });

  it('RF-406 rejects a call that fails for good with a provider RST code', async () => {
    const provider = await create('permanent-failure');

    const error = await failureOf(provider.complete(contractRequest(), new RecordingObserver()));

    expect(error).toBeInstanceOf(RosettaError);
    expect(error instanceof RosettaError && isProviderCode(error.code)).toBe(true);
  });

  it('RF-400 rejects with RST-1501 when the signal is already aborted', async () => {
    const provider = await create('text');
    const controller = new AbortController();
    controller.abort();

    const error = await failureOf(provider.complete(contractRequest(controller.signal)));

    expect(error).toBeInstanceOf(RosettaError);
    expect(error instanceof RosettaError ? error.code : '').toBe(ERROR_CODES.providerCallCancelled);
  });
}

/** Contract of the LlmProvider port (RF-400): every adapter, the fake and every decorator. */
export function llmProviderContract(name: string, create: LlmProviderFactory): void {
  describe(`LlmProvider contract: ${name}`, () => {
    answerTests(create);
    attemptTests(create);
  });
}
