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
import { shippingCards } from '../../../support/agent-fixtures.js';
import {
  ungatedLoopSetup,
  readOrder,
  textTurn,
  toolTurn,
  usage,
} from '../../../support/agent-loop-harness.js';

// RF-201, RF-202, P1-90: the repair turn is a turn like any other: it respects the turn cap, the
// context share and the abort signal; and a stop between two tool calls runs no further tool.

describe('runAgentTask repair turn limits', () => {
  it('RF-201 no repair turn starts when the maximum turns are used', async () => {
    const { fake, request } = ungatedLoopSetup([textTurn('not cards'), textTurn(shippingCards)], {
      maxTurns: 1,
    });

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('TurnLimitReached');
    expect(result.reason).toBe('max-turns');
    expect(result.code).toBe(ERROR_CODES.agentTurnLimitReached);
    expect(fake.requests).toHaveLength(1);
  });

  it('RF-201 no repair turn starts when the conversation reaches its share of the context', async () => {
    const big: TokenUsage = { ...usage, inputTokens: 600 };
    const { fake, request } = ungatedLoopSetup(
      [textTurn('not cards', big), textTurn(shippingCards)],
      {
        contextTokens: 1000,
        contextShare: 0.5,
      },
    );

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('TurnLimitReached');
    expect(result.reason).toBe('context-limit');
    expect(result.code).toBe(ERROR_CODES.agentContextLimitReached);
    expect(fake.requests).toHaveLength(1);
  });
});

describe('runAgentTask repair turn and a stop', () => {
  it('RF-201 no repair turn starts after a stop', async () => {
    const { fake, request } = ungatedLoopSetup([textTurn('not cards'), textTurn(shippingCards)]);
    const controller = new AbortController();
    let calls = 0;
    const aborting: LlmProvider = {
      async complete(sent: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
        calls += 1;
        const response = await fake.complete(sent, observer);
        controller.abort();
        return response;
      },
    };

    const result = await runAgentTask(request(aborting, controller.signal));

    expect(result.state).toBe('Failed');
    expect(result.reason).toBe('aborted');
    expect(result.code).toBe(ERROR_CODES.providerCallCancelled);
    // The loop itself checks the signal; it does not rely on the provider to refuse the call.
    expect(calls).toBe(1);
  });
});

describe('runAgentTask stop between tool calls', () => {
  it('RF-201 a stop during one tool call runs none of the calls after it', async () => {
    const listFiles = { name: 'list_area_files', args: {} };
    const { fake, request } = ungatedLoopSetup([
      toolTurn([readOrder, listFiles]),
      textTurn(shippingCards),
    ]);
    const controller = new AbortController();
    const base = request(fake, controller.signal);
    const ran: string[] = [];
    const tools: typeof base.tools = {
      definitions: base.tools.definitions,
      areaOverview: () => base.tools.areaOverview(),
      readableAreaFiles: () => base.tools.readableAreaFiles(),
      renderBlock: (source, text) => base.tools.renderBlock(source, text),
      run: async (call, ids) => {
        ran.push(call.name);
        const outcome = await base.tools.run(call, ids);
        controller.abort();
        return outcome;
      },
    };

    const result = await runAgentTask({ ...base, tools });

    expect(result.state).toBe('Failed');
    expect(result.reason).toBe('aborted');
    expect(ran).toEqual(['read_file']);
    expect(fake.requests).toHaveLength(1);
  });
});
