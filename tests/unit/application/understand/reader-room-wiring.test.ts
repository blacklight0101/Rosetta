import { describe, expect, it } from 'vitest';
import type { LlmProvider, LlmRequest } from '../../../../src/application/ports/llm-provider.js';
import type { RoleProvider } from '../../../../src/application/providers/provider-set.js';
import { withRoom } from '../../../../src/application/understand/reader-room.js';
import type { Spend } from '../../../../src/domain/budget/claim-room.js';
import { contractRequest } from '../../../contracts/llm-provider.contract.js';
import { fakeResponse } from '../../../support/fake-recordings.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { hold, settle, type Hold } from '../../../support/parallel-judgement.js';

// RF-429, P8-132: the room of a run is made from the reader's provider, and the worst case that
// provider reports is what the room counts. The tests of the room hand it a worst case by hand; this
// one goes through withRoom, as the understand run does, so the fix is off when the wiring is.

const answer = fakeResponse({
  text: 'done',
  toolCalls: [],
  usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
  finishReason: 'stop',
});

const oneCall: Spend = { tokens: 6_000n, micros: 6_000n };
const nothing: Spend = { tokens: 0n, micros: 0n };
const tasks = ['reader-001', 'reader-002', 'reader-003', 'reader-004'];

function readerOf(worstCaseOf: RoleProvider['worstCaseOf']): RoleProvider {
  return {
    provider: { complete: () => Promise.resolve(answer) },
    name: 'openai',
    kind: 'openai',
    model: 'gpt-5-nano',
    maxOutputTokens: 4_000,
    keySource: 'server',
    runCaps: { tokens: 10_000n, micros: 0n },
    ...(worstCaseOf === undefined ? {} : { worstCaseOf }),
  };
}

/** The tasks that reached the provider when four readers of a run built by withRoom call together. */
async function startedByFourReaders(role: RoleProvider): Promise<string[]> {
  const room = withRoom(
    { events: { emit: () => Promise.resolve(undefined) }, stop: () => undefined },
    { settings: sampleProject().settings, role },
    {
      roleSpend: () => nothing,
      runSpend: () => nothing,
      stoppedAtLine: () => false,
    },
  ).room;
  const started: string[] = [];
  const gates: Hold[] = [];
  const inner: LlmProvider = {
    complete: async (request: LlmRequest) => {
      started.push(request.context.agentTaskId);
      const gate = hold();
      gates.push(gate);
      await gate.opened;
      return answer;
    },
  };
  const calls = tasks.map((task) =>
    room.guard(inner, task).complete({
      ...contractRequest(),
      context: { ...contractRequest().context, agentTaskId: task },
    }),
  );
  await settle();
  const first = [...started];
  for (let round = 0; round < 8; round += 1) {
    gates.forEach((gate) => {
      gate.open();
    });
    await settle();
  }
  await Promise.all(calls);
  return first;
}

describe('RF-429 P8-132 the room of a run counts the worst case its reader provider reports', () => {
  it('RF-429 four readers at a cap for one call at its worst case start one call', async () => {
    expect(await startedByFourReaders(readerOf(() => oneCall))).toEqual(['reader-001']);
  });

  it('RF-429 a reader provider that reports no worst case leaves the room as it was: all four start', async () => {
    expect(await startedByFourReaders(readerOf(undefined))).toEqual(tasks);
  });
});
