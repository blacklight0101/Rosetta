import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import { holdsDataMarker } from '../../../../src/domain/egress/data-block.js';
import { shippingCards, testReaderPrompts } from '../../../support/agent-fixtures.js';
import { blockOf } from '../../../support/agent-tools-harness.js';
import { loopSetup, readOrder, textTurn, toolTurn } from '../../../support/agent-loop-harness.js';

// RF-201, RF-202, RF-145, ADR-003: the reader's tool-calling loop over the LlmProvider port, driven
// by the fake provider with scripted turns.

describe('runAgentTask turns', () => {
  it('RF-201 runs tools until the final answer and returns its cards', async () => {
    const { fake, request } = loopSetup([toolTurn([readOrder]), textTurn(shippingCards)]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Done');
    expect(result.reason).toBe('final-answer');
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Free shipping over 50']);
    expect(result.turns).toBe(2);
    expect(fake.requests.map((sent) => sent.context.callId)).toEqual(['run-1#1', 'run-1#2']);
  });

  it('RF-201 tells the model how many turns are left after each tool turn', async () => {
    const { fake, request } = loopSetup([toolTurn([readOrder]), textTurn(shippingCards)]);

    await runAgentTask(request(fake));
    const last = fake.requests[1]?.messages.at(-1);

    expect(last).toEqual({ role: 'user', content: 'Turns left: 4.' });
  });

  it('RF-201 adds up the usage of every turn and keeps the model version', async () => {
    const { fake, request } = loopSetup([toolTurn([readOrder]), textTurn(shippingCards)]);

    const result = await runAgentTask(request(fake));

    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 20, cachedInputTokens: 0 });
    expect(result.modelVersion).toBe('fake-model-2026-10-01');
  });
});

describe('runAgentTask prompts and data blocks', () => {
  it('RF-145 keeps repository content out of the system prompt and the tool definitions', async () => {
    const { fake, request } = loopSetup([toolTurn([readOrder]), textTurn(shippingCards)]);

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
    const { fake, request } = loopSetup([toolTurn([readOrder]), textTurn(shippingCards)]);

    await runAgentTask(request(fake));
    const messages = fake.requests[1]?.messages ?? [];

    const [task] = messages;
    const tool = messages.find((message) => message.role === 'tool');

    expect(task).toMatchObject({ role: 'user' });
    expect(task?.content).toContain('Describe the area below.');
    expect(task?.content).toContain('"source":"list_area_files"');
    expect(blockOf(tool?.content ?? '').excerpts).toHaveLength(1);
  });

  it('RF-201 sends the same system prompt and tools on every turn', async () => {
    const { fake, request } = loopSetup([toolTurn([readOrder]), textTurn(shippingCards)]);

    await runAgentTask(request(fake));
    const [first, second] = fake.requests;

    expect(second?.system).toBe(first?.system);
    expect(second?.tools).toEqual(first?.tools);
    expect(second?.messages.slice(0, first?.messages.length)).toEqual(first?.messages);
  });
});
