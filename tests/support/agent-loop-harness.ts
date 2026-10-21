import type { AgentTaskRequest } from '../../src/application/agent/agent-loop.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import { ReadOnlyTools } from '../../src/application/agent/read-only-tools.js';
import type { LlmProvider, TokenUsage } from '../../src/application/ports/llm-provider.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FakeProvider } from '../../src/infrastructure/providers/fake/fake-provider.js';
import type { ScenarioOutcome } from '../contracts/llm-provider.contract.js';
import { agentCodeMap, agentFiles, ordersArea, testReaderPrompts } from './agent-fixtures.js';
import { recordingOf } from './fake-recordings.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { MemoryRepositoryReader } from './memory-repository-reader.js';

// RF-201: the reader's loop over the in-memory tools of agent-fixtures.ts and a fake provider that
// replays scripted turns.

export const usage: TokenUsage = {
  inputTokens: 100,
  outputTokens: 10,
  cachedInputTokens: 0,
  usageSource: 'reported',
};

export interface Call {
  readonly name: string;
  readonly args: unknown;
}

export function toolTurn(calls: readonly Call[], turnUsage: TokenUsage = usage): ScenarioOutcome {
  return {
    response: {
      text: '',
      toolCalls: calls.map((call, index) => ({
        id: `call-${String(index + 1)}`,
        name: call.name,
        arguments: call.args,
      })),
      usage: turnUsage,
      finishReason: 'tool_use',
    },
    retried: [],
  };
}

export function textTurn(text: string, turnUsage: TokenUsage = usage): ScenarioOutcome {
  return {
    response: { text, toolCalls: [], usage: turnUsage, finishReason: 'stop' },
    retried: [],
  };
}

export const readOrder: Call = {
  name: 'read_file',
  args: { path: 'src/Orders/OrderService.cs', startLine: 1, endLine: 7 },
};

type Settings = AgentTaskRequest['settings'];

export interface LoopSetup {
  readonly fake: FakeProvider;
  readonly logger: MemoryLogger;
  readonly request: (provider: LlmProvider, signal?: AbortSignal) => AgentTaskRequest;
}

/**
 * The same tools for an area the reader has nothing to read in, so the read-first rule (RF-206) does
 * not apply: for the tests of what happens to an answer, which are not about reading.
 */
function ungated(tools: ReadOnlyTools): AgentTaskRequest['tools'] {
  return {
    definitions: tools.definitions,
    areaOverview: () => tools.areaOverview(),
    readableAreaFiles: () => [],
    readableAreaEntries: () => [],
    renderBlock: (source, text) => tools.renderBlock(source, text),
    rowSpans: (path) => tools.rowSpans(path),
    run: (call, ids) => tools.run(call, ids),
  };
}

export function loopSetup(
  outcomes: readonly ScenarioOutcome[],
  settings: Partial<Settings> = {},
  gated = true,
): LoopSetup {
  const fake = new FakeProvider({ testMode: true, recording: recordingOf(...outcomes) });
  const logger = new MemoryLogger(new FixedClock('2026-10-12T09:00:00.000Z'), new SecretMasker());
  const reader = new MemoryRepositoryReader(agentFiles);
  const tools = new ReadOnlyTools({
    ...{ reader, codeMap: agentCodeMap, area: ordersArea, logger },
    ids: new SequenceIdGenerator(),
  });
  let calls = 0;
  const request = (
    provider: LlmProvider,
    signal = new AbortController().signal,
  ): AgentTaskRequest => ({
    provider,
    tools: gated ? tools : ungated(tools),
    prompts: testReaderPrompts,
    logger,
    settings: {
      model: 'fake-model',
      maxTurns: 5,
      contextTokens: 100_000,
      contextShare: 0.8,
      ...settings,
    },
    context: {
      runId: 'run-1',
      agentTaskId: 'task-orders',
      role: 'reader',
      traceId: 'a'.repeat(32),
      parentSpanId: 'b'.repeat(16),
    },
    nextCallId: () => {
      calls += 1;
      return `run-1#${String(calls)}`;
    },
    signal,
  });
  return { fake, logger, request };
}

/** `loopSetup` for tests of the answer's follow-ups, where the read-first rule does not apply. */
export function ungatedLoopSetup(
  outcomes: readonly ScenarioOutcome[],
  settings: Partial<Settings> = {},
): LoopSetup {
  return loopSetup(outcomes, settings, false);
}
