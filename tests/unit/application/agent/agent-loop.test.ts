import { describe, expect, it } from 'vitest';
import {
  runAgentTask,
  type AgentTaskRequest,
} from '../../../../src/application/agent/agent-loop.js';
import { ReadOnlyTools } from '../../../../src/application/agent/read-only-tools.js';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  TokenUsage,
} from '../../../../src/application/ports/llm-provider.js';
import { scanDataBlocks } from '../../../../src/domain/egress/data-block-scan.js';
import { holdsDataMarker } from '../../../../src/domain/egress/data-block.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { FakeProvider } from '../../../../src/infrastructure/providers/fake/fake-provider.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import type { ScenarioOutcome } from '../../../contracts/llm-provider.contract.js';
import {
  agentCodeMap,
  agentFiles,
  ordersArea,
  shippingCards,
  testReaderPrompts,
} from '../../../support/agent-fixtures.js';
import { recordingOf } from '../../../support/fake-recordings.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { MemoryRepositoryReader } from '../../../support/memory-repository-reader.js';

// RF-201, RF-202, RF-145, ADR-003: the reader's tool-calling loop over the LlmProvider port, driven
// by the fake provider with scripted turns.

const usage: TokenUsage = {
  inputTokens: 100,
  outputTokens: 10,
  cachedInputTokens: 0,
  usageSource: 'reported',
};

interface Call {
  readonly name: string;
  readonly args: unknown;
}

function toolTurn(calls: readonly Call[], turnUsage: TokenUsage = usage): ScenarioOutcome {
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

function textTurn(text: string): ScenarioOutcome {
  return { response: { text, toolCalls: [], usage, finishReason: 'stop' }, retried: [] };
}

const readOrder: Call = {
  name: 'read_file',
  args: { path: 'src/Orders/OrderService.cs', startLine: 1, endLine: 7 },
};

type Settings = AgentTaskRequest['settings'];

function setup(outcomes: readonly ScenarioOutcome[], settings: Partial<Settings> = {}) {
  const fake = new FakeProvider({ testMode: true, recording: recordingOf(...outcomes) });
  const logger = new MemoryLogger(new FixedClock('2026-10-12T09:00:00.000Z'), new SecretMasker());
  const reader = new MemoryRepositoryReader(agentFiles);
  const tools = new ReadOnlyTools({ reader, codeMap: agentCodeMap, area: ordersArea, logger });
  let calls = 0;
  const request = (
    provider: LlmProvider,
    signal = new AbortController().signal,
  ): AgentTaskRequest => ({
    provider,
    tools,
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

describe('runAgentTask', () => {
  it('RF-201 runs tools until the final answer and returns its cards', async () => {
    const { fake, request } = setup([toolTurn([readOrder]), textTurn(shippingCards)]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Done');
    expect(result.reason).toBe('final-answer');
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Free shipping over 50']);
    expect(result.turns).toBe(2);
    expect(fake.requests.map((sent) => sent.context.callId)).toEqual(['run-1#1', 'run-1#2']);
  });

  it('RF-145 keeps repository content out of the system prompt and the tool definitions', async () => {
    const { fake, request } = setup([toolTurn([readOrder]), textTurn(shippingCards)]);

    await runAgentTask(request(fake));

    for (const sent of fake.requests) {
      expect(sent.system).toBe(
        `${testReaderPrompts.system.text}\n\n${testReaderPrompts.cardFormat.text}`,
      );
      expect(holdsDataMarker(sent.system)).toBe(false);
      expect(JSON.stringify(sent.tools)).not.toContain('src/Orders');
    }
  });

  it('RF-145 sends the area and every tool result as data blocks', async () => {
    const { fake, request } = setup([toolTurn([readOrder]), textTurn(shippingCards)]);

    await runAgentTask(request(fake));
    const messages = fake.requests[1]?.messages ?? [];

    const task = messages[0];
    expect(task?.role).toBe('user');
    expect(task?.content).toContain('Describe the area below.');
    expect(task?.content).toContain('"source":"list_area_files"');
    const tool = messages.find((message) => message.role === 'tool');
    const scan = tool === undefined ? undefined : scanDataBlocks(tool.content);
    expect(scan?.ok && scan.value.blocks).toBe(1);
    expect(scan?.ok && scan.value.textOutside).toBe(false);
  });

  it('RF-201 tells the model how many turns are left after each tool turn', async () => {
    const { fake, request } = setup([toolTurn([readOrder]), textTurn(shippingCards)]);

    await runAgentTask(request(fake));
    const last = fake.requests[1]?.messages.at(-1);

    expect(last).toEqual({ role: 'user', content: 'Turns left: 4.' });
  });

  it('RF-201 ends as TurnLimitReached when the maximum turns are used', async () => {
    const { fake, request } = setup(
      [toolTurn([readOrder]), toolTurn([{ name: 'list_area_files', args: {} }])],
      { maxTurns: 2 },
    );

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('TurnLimitReached');
    expect(result.reason).toBe('max-turns');
    expect(result.code).toBe(ERROR_CODES.agentTurnLimitReached);
    expect(result.drafts).toEqual([]);
    expect(fake.requests).toHaveLength(2);
  });

  it('RF-201 a bad tool call gets an error result and the corrected call goes on', async () => {
    const bad: Call = {
      name: 'read_file',
      args: { path: 'src/Orders/OrderService.cs', startLine: 'x' },
    };
    const { fake, request, logger } = setup([
      toolTurn([bad]),
      toolTurn([readOrder]),
      textTurn(shippingCards),
    ]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Done');
    expect(result.toolErrors).toBe(1);
    expect(logger.entries.map((entry) => entry.code)).toContain(ERROR_CODES.toolArgumentsInvalid);
  });

  it('RF-201 ends cleanly with a recorded reason when the model keeps repeating a call', async () => {
    const { fake, request, logger } = setup(
      Array.from({ length: 4 }, () => toolTurn([readOrder])),
      { maxTurns: 10 },
    );

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Failed');
    expect(result.reason).toBe('repeated-calls');
    expect(result.code).toBe(ERROR_CODES.agentRepeatedCalls);
    expect(fake.requests).toHaveLength(4);
    expect(logger.entries.at(-1)?.data).toMatchObject({ reason: 'repeated-calls' });
  });

  it('RF-201 ends cleanly with a recorded reason when the model keeps calling unknown tools', async () => {
    const unknown: Call = { name: 'delete_file', args: { path: 'a' } };
    const { fake, request } = setup(
      Array.from({ length: 3 }, () => toolTurn([unknown])),
      {
        maxTurns: 10,
      },
    );

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Failed');
    expect(result.reason).toBe('unknown-tools');
    expect(result.code).toBe(ERROR_CODES.toolUnknown);
  });

  it('RF-201 ends as TurnLimitReached when the prompt reaches its share of the context', async () => {
    const big: TokenUsage = { ...usage, inputTokens: 600 };
    const { fake, request } = setup([toolTurn([readOrder], big), textTurn(shippingCards)], {
      contextTokens: 1000,
      contextShare: 0.5,
    });

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('TurnLimitReached');
    expect(result.reason).toBe('context-limit');
    expect(result.code).toBe(ERROR_CODES.agentContextLimitReached);
    expect(fake.requests).toHaveLength(1);
  });

  it('RF-201 honours the abort signal between turns', async () => {
    const { fake, request } = setup([toolTurn([readOrder]), textTurn(shippingCards)]);
    const controller = new AbortController();
    const aborting: LlmProvider = {
      async complete(sent: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
        const response = await fake.complete(sent, observer);
        controller.abort();
        return response;
      },
    };

    const result = await runAgentTask(request(aborting, controller.signal));

    expect(result.state).toBe('Failed');
    expect(result.reason).toBe('aborted');
    expect(result.code).toBe(ERROR_CODES.providerCallCancelled);
    expect(fake.requests).toHaveLength(1);
  });

  it('RF-201 a provider failure ends the task as Failed with its code', async () => {
    const failure: ScenarioOutcome = {
      retried: [],
      failure: { code: ERROR_CODES.providerCallFailed },
    };
    const { fake, request } = setup([failure]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Failed');
    expect(result.reason).toBe('provider-failed');
    expect(result.code).toBe(ERROR_CODES.providerCallFailed);
  });

  it('RF-202 an invalid final answer gets one repair turn with the problems', async () => {
    const { fake, request } = setup([textTurn('Here is my summary.'), textTurn(shippingCards)]);

    const result = await runAgentTask(request(fake));
    const repair = fake.requests[1]?.messages.at(-1);

    expect(result.state).toBe('Done');
    expect(result.drafts).toHaveLength(1);
    expect(repair?.role).toBe('user');
    expect(repair?.content).toContain('Fix these problems:\n- (answer): No JSON found');
  });

  it('RF-202 a second invalid answer ends as InvalidOutput with both raw outputs', async () => {
    const { fake, request } = setup([textTurn('first'), textTurn('second')]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('InvalidOutput');
    expect(result.reason).toBe('invalid-output');
    expect(result.code).toBe(ERROR_CODES.cardOutputInvalid);
    expect(result.rawOutputs).toEqual(['first', 'second']);
  });

  it('RF-201 adds up the usage of every turn and keeps the model version', async () => {
    const { fake, request } = setup([toolTurn([readOrder]), textTurn(shippingCards)]);

    const result = await runAgentTask(request(fake));

    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 20, cachedInputTokens: 0 });
    expect(result.modelVersion).toBe('fake-model-2026-10-01');
  });

  it('RF-201 sends the same system prompt and tools on every turn', async () => {
    const { fake, request } = setup([toolTurn([readOrder]), textTurn(shippingCards)]);

    await runAgentTask(request(fake));
    const [first, second] = fake.requests;

    expect(second?.system).toBe(first?.system);
    expect(second?.tools).toEqual(first?.tools);
    expect(second?.messages.slice(0, first?.messages.length)).toEqual(first?.messages);
  });
});
