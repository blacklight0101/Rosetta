import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { shippingCards } from '../../../support/agent-fixtures.js';
import { loopSetup, readOrder, textTurn, toolTurn } from '../../../support/agent-loop-harness.js';

// RF-422, ADR-007, architecture section 5 (`AgentTaskState`): a task whose call the budget guard
// refuses, or that sees the run's signal aborted by another task's cap refusal, ends as
// `StoppedByCap` with the budget code, keeping what it learned so far.

const capRefusal = (): RosettaError => new RosettaError(ERROR_CODES.budgetCapReached);

describe('runAgentTask and the caps', () => {
  it('RF-422 ends as StoppedByCap when the guard refuses its call', async () => {
    const { fake, request } = loopSetup([toolTurn([readOrder]), textTurn(shippingCards)]);
    let calls = 0;
    const capped: LlmProvider = {
      async complete(sent: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
        calls += 1;
        if (calls === 2) throw capRefusal();
        return fake.complete(sent, observer);
      },
    };

    const result = await runAgentTask(request(capped));

    expect(result.state).toBe('StoppedByCap');
    expect(result.reason).toBe('cap-reached');
    expect(result.code).toBe(ERROR_CODES.budgetCapReached);
    expect(result.turns).toBe(1);
  });

  it('RF-422 ends as StoppedByCap when another task stopped the run for a cap', async () => {
    const { fake, request } = loopSetup([toolTurn([readOrder]), textTurn(shippingCards)]);
    const controller = new AbortController();
    const stopping: LlmProvider = {
      async complete(sent: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
        const response = await fake.complete(sent, observer);
        controller.abort(capRefusal());
        return response;
      },
    };

    const result = await runAgentTask(request(stopping, controller.signal));

    expect(result.state).toBe('StoppedByCap');
    expect(result.code).toBe(ERROR_CODES.budgetCapReached);
    expect(fake.requests).toHaveLength(1);
  });
});

describe('runAgentTask and stops', () => {
  it('RF-422 a call cancelled by a cap stop ends as StoppedByCap, not Failed', async () => {
    const { request } = loopSetup([]);
    const controller = new AbortController();
    const cancelled: LlmProvider = {
      complete(): Promise<LlmResponse> {
        controller.abort(capRefusal());
        return Promise.reject(new RosettaError(ERROR_CODES.providerCallCancelled));
      },
    };

    const result = await runAgentTask(request(cancelled, controller.signal));

    expect(result.state).toBe('StoppedByCap');
  });

  it('RF-1003 a stop by the user still ends the task as Failed with RST-1501', async () => {
    const { request } = loopSetup([]);
    const controller = new AbortController();
    controller.abort();

    const result = await runAgentTask(
      request({ complete: () => Promise.reject(new Error('unused')) }, controller.signal),
    );

    expect(result.state).toBe('Failed');
    expect(result.code).toBe(ERROR_CODES.providerCallCancelled);
  });
});
