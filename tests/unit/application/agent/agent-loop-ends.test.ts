import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  TokenUsage,
} from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { ScenarioOutcome } from '../../../contracts/llm-provider.contract.js';
import { shippingCards } from '../../../support/agent-fixtures.js';
import {
  loopSetup,
  readOrder,
  textTurn,
  toolTurn,
  usage,
  type Call,
} from '../../../support/agent-loop-harness.js';

// RF-201, RF-202, RF-145, ADR-003: the reader's tool-calling loop over the LlmProvider port, driven
// by the fake provider with scripted turns.

describe('runAgentTask limits', () => {
  it('RF-201 ends as TurnLimitReached when the maximum turns are used', async () => {
    const { fake, request } = loopSetup(
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

  it('RF-201 ends as TurnLimitReached when the prompt reaches its share of the context', async () => {
    const big: TokenUsage = { ...usage, inputTokens: 600 };
    const { fake, request } = loopSetup([toolTurn([readOrder], big), textTurn(shippingCards)], {
      contextTokens: 1000,
      contextShare: 0.5,
    });

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('TurnLimitReached');
    expect(result.reason).toBe('context-limit');
    expect(result.code).toBe(ERROR_CODES.agentContextLimitReached);
    expect(fake.requests).toHaveLength(1);
  });
});

describe('runAgentTask and a model that errs', () => {
  it('RF-201 a bad tool call gets an error result and the corrected call goes on', async () => {
    const bad: Call = {
      name: 'read_file',
      args: { path: 'src/Orders/OrderService.cs', startLine: 'x' },
    };
    const { fake, request, logger } = loopSetup([
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
    const { fake, request, logger } = loopSetup(
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
});

describe('runAgentTask and a model that misbehaves', () => {
  it('RF-201 ends cleanly with a recorded reason when the model keeps calling unknown tools', async () => {
    const unknown: Call = { name: 'delete_file', args: { path: 'a' } };
    const { fake, request } = loopSetup(
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

  it('RF-201 a provider failure ends the task as Failed with its code', async () => {
    const failure: ScenarioOutcome = {
      retried: [],
      failure: { code: ERROR_CODES.providerCallFailed },
    };
    const { fake, request } = loopSetup([failure]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Failed');
    expect(result.reason).toBe('provider-failed');
    expect(result.code).toBe(ERROR_CODES.providerCallFailed);
  });
});

describe('runAgentTask stop', () => {
  it('RF-201 honours the abort signal between turns', async () => {
    const { fake, request } = loopSetup([toolTurn([readOrder]), textTurn(shippingCards)]);
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
});

describe('runAgentTask final answer repair', () => {
  it('RF-202 an invalid final answer gets one repair turn with the problems', async () => {
    const { fake, request } = loopSetup([textTurn('Here is my summary.'), textTurn(shippingCards)]);

    const result = await runAgentTask(request(fake));
    const repair = fake.requests[1]?.messages.at(-1);

    expect(result.state).toBe('Done');
    expect(result.drafts).toHaveLength(1);
    expect(repair?.role).toBe('user');
    expect(repair?.content).toContain('Fix these problems:\n- (answer): No JSON found');
  });

  it('RF-202 a second invalid answer ends as InvalidOutput with both raw outputs', async () => {
    const { fake, request } = loopSetup([textTurn('first'), textTurn('second')]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('InvalidOutput');
    expect(result.reason).toBe('invalid-output');
    expect(result.code).toBe(ERROR_CODES.cardOutputInvalid);
    expect(result.rawOutputs).toEqual(['first', 'second']);
  });
});
